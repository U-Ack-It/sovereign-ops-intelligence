export type McpPolicyErrorCode =
  | "MCP_TOOL_NOT_ALLOWED"
  | "MCP_RESOURCE_NOT_ALLOWED"
  | "MCP_PROMPT_NOT_ALLOWED"
  | "MCP_INPUT_TOO_LONG"
  | "MCP_FORBIDDEN_TEXT"
  | "MCP_TOOL_BUDGET_EXCEEDED"
  | "MCP_RATE_LIMIT_EXCEEDED";

export type McpPolicyArea = "tool" | "resource" | "prompt" | "input" | "budget";

export type McpPolicyErrorDetails = {
  code: McpPolicyErrorCode;
  message: string;
  policyArea: McpPolicyArea;
  limit?: number;
};

export class McpPolicyError extends Error {
  readonly code: McpPolicyErrorCode;
  readonly policyArea: McpPolicyArea;
  readonly limit?: number;

  constructor(details: McpPolicyErrorDetails) {
    super(details.message);
    this.name = "McpPolicyError";
    this.code = details.code;
    this.policyArea = details.policyArea;
    this.limit = details.limit;
  }

  toJSON(): McpPolicyErrorDetails {
    return {
      code: this.code,
      message: this.message,
      policyArea: this.policyArea,
      ...(this.limit === undefined ? {} : { limit: this.limit }),
    };
  }
}

export const MCP_POLICY_LIMITS = {
  maxInputChars: 2000,
  maxSkillIdChars: 120,
  maxToolCallsPerSession: 20,
  maxToolCallsPerMinute: 10,
  maxResourceReadChars: 20000,
  maxPromptChars: 4000,
} as const;

export const MCP_ALLOWED_TOOLS = [
  "sovereign_advisor_route",
  "sovereign_advisor_execute",
  "sovereign_skill_execute",
] as const;

export const MCP_ALLOWED_RESOURCES = [
  "sovereign://openapi",
  "sovereign://docs/architecture",
  "sovereign://docs/api",
] as const;

export const MCP_ALLOWED_PROMPTS = [
  "sovereign-operations-triage",
  "sovereign-security-review",
  "sovereign-compliance-review",
] as const;

export const MCP_FORBIDDEN_TERMS = [
  "SOVEREIGN_ADMIN_API_KEY",
  "OTEL_EXPORTER_OTLP_HEADERS",
  "x-admin-api-key",
  "/agents/audit",
  "/agents/dashboard",
  "/agents/metrics",
  "sovereign.db",
  "data/sovereign.db",
  "BEGIN RSA",
  "BEGIN OPENSSH",
  "private key",
  "password",
  "secret token",
] as const;

type InvocationRecord = {
  toolName: string;
  timestamp: number;
};

let sessionToolCalls = 0;
let invocationRecords: InvocationRecord[] = [];

function fail(details: McpPolicyErrorDetails): never {
  throw new McpPolicyError(details);
}

function includesValue(values: readonly string[], value: string): boolean {
  return values.includes(value);
}

export function assertAllowedTool(toolName: string): void {
  if (!includesValue(MCP_ALLOWED_TOOLS, toolName)) {
    fail({
      code: "MCP_TOOL_NOT_ALLOWED",
      message: "MCP tool is not allowed by policy.",
      policyArea: "tool",
    });
  }
}

export function assertAllowedResource(uri: string): void {
  if (!includesValue(MCP_ALLOWED_RESOURCES, uri)) {
    fail({
      code: "MCP_RESOURCE_NOT_ALLOWED",
      message: "MCP resource is not allowed by policy.",
      policyArea: "resource",
    });
  }
}

export function assertAllowedPrompt(promptName: string): void {
  if (!includesValue(MCP_ALLOWED_PROMPTS, promptName)) {
    fail({
      code: "MCP_PROMPT_NOT_ALLOWED",
      message: "MCP prompt is not allowed by policy.",
      policyArea: "prompt",
    });
  }
}

export function assertSafeText(label: string, value: string): void {
  const normalized = value.toLowerCase();
  const forbiddenTerm = MCP_FORBIDDEN_TERMS.find((term) =>
    normalized.includes(term.toLowerCase()),
  );

  if (forbiddenTerm) {
    fail({
      code: "MCP_FORBIDDEN_TEXT",
      message: `MCP policy blocked unsafe text in ${label}.`,
      policyArea: "input",
    });
  }
}

export function assertInputBudget(toolName: string, input: string): void {
  assertAllowedTool(toolName);

  const limit =
    toolName === "sovereign_skill_execute"
      ? MCP_POLICY_LIMITS.maxInputChars
      : MCP_POLICY_LIMITS.maxInputChars;

  if (input.length > limit) {
    fail({
      code: "MCP_INPUT_TOO_LONG",
      message: "MCP input exceeds the configured character limit.",
      policyArea: "input",
      limit,
    });
  }
}

export function assertSkillIdBudget(skillId: string): void {
  if (skillId.length > MCP_POLICY_LIMITS.maxSkillIdChars) {
    fail({
      code: "MCP_INPUT_TOO_LONG",
      message: "MCP skill id exceeds the configured character limit.",
      policyArea: "input",
      limit: MCP_POLICY_LIMITS.maxSkillIdChars,
    });
  }
}

export function assertResourceReadBudget(uri: string, text: string): void {
  assertAllowedResource(uri);

  if (text.length > MCP_POLICY_LIMITS.maxResourceReadChars) {
    fail({
      code: "MCP_INPUT_TOO_LONG",
      message: "MCP resource exceeds the configured read limit.",
      policyArea: "resource",
      limit: MCP_POLICY_LIMITS.maxResourceReadChars,
    });
  }

  assertSafeText(`resource:${uri}`, text);
}

export function assertPromptBudget(promptName: string, text: string): void {
  assertAllowedPrompt(promptName);

  if (text.length > MCP_POLICY_LIMITS.maxPromptChars) {
    fail({
      code: "MCP_INPUT_TOO_LONG",
      message: "MCP prompt exceeds the configured character limit.",
      policyArea: "prompt",
      limit: MCP_POLICY_LIMITS.maxPromptChars,
    });
  }

  assertSafeText(`prompt:${promptName}`, text);
}

export function recordToolInvocation(toolName: string, now = Date.now()): void {
  assertAllowedTool(toolName);

  if (sessionToolCalls >= MCP_POLICY_LIMITS.maxToolCallsPerSession) {
    fail({
      code: "MCP_TOOL_BUDGET_EXCEEDED",
      message: "MCP session tool budget exceeded.",
      policyArea: "budget",
      limit: MCP_POLICY_LIMITS.maxToolCallsPerSession,
    });
  }

  const windowStart = now - 60_000;
  invocationRecords = invocationRecords.filter((record) => record.timestamp >= windowStart);

  if (invocationRecords.length >= MCP_POLICY_LIMITS.maxToolCallsPerMinute) {
    fail({
      code: "MCP_RATE_LIMIT_EXCEEDED",
      message: "MCP per-minute tool budget exceeded.",
      policyArea: "budget",
      limit: MCP_POLICY_LIMITS.maxToolCallsPerMinute,
    });
  }

  sessionToolCalls += 1;
  invocationRecords.push({ toolName, timestamp: now });
}

export function resetMcpPolicyState(): void {
  sessionToolCalls = 0;
  invocationRecords = [];
}

export function getMcpPolicySnapshot() {
  return {
    allowedTools: [...MCP_ALLOWED_TOOLS],
    allowedResources: [...MCP_ALLOWED_RESOURCES],
    allowedPrompts: [...MCP_ALLOWED_PROMPTS],
    limits: { ...MCP_POLICY_LIMITS },
    sessionToolCalls,
    callsInCurrentMinute: invocationRecords.length,
  };
}
