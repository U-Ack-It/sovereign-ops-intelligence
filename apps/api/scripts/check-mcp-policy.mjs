import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiDir = path.resolve(__dirname, "..");

const policyPath = path.join(apiDir, "src/mcp/policy.ts");
const manifestPath = path.join(apiDir, "src/mcp/manifest.ts");

const requiredTools = [
  "sovereign_advisor_route",
  "sovereign_advisor_execute",
  "sovereign_skill_execute",
];

const requiredResources = [
  "sovereign://openapi",
  "sovereign://docs/architecture",
  "sovereign://docs/api",
];

const requiredPrompts = [
  "sovereign-operations-triage",
  "sovereign-security-review",
  "sovereign-compliance-review",
];

const requiredErrorCodes = [
  "MCP_TOOL_NOT_ALLOWED",
  "MCP_RESOURCE_NOT_ALLOWED",
  "MCP_PROMPT_NOT_ALLOWED",
  "MCP_INPUT_TOO_LONG",
  "MCP_FORBIDDEN_TEXT",
  "MCP_TOOL_BUDGET_EXCEEDED",
  "MCP_RATE_LIMIT_EXCEEDED",
];

const requiredLimits = [
  "maxInputChars",
  "maxSkillIdChars",
  "maxToolCallsPerSession",
  "maxToolCallsPerMinute",
  "maxResourceReadChars",
  "maxPromptChars",
];

const requiredForbiddenTerms = [
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
];

const forbiddenManifestTerms = [
  "/agents/audit",
  "/agents/dashboard",
  "/agents/metrics",
  "SOVEREIGN_ADMIN_API_KEY",
  "OTEL_EXPORTER_OTLP_HEADERS",
  "x-admin-api-key",
];

const failures = [];

function requireFile(filePath, label) {
  if (!existsSync(filePath)) {
    failures.push(`Missing ${label}: ${path.relative(apiDir, filePath)}`);
    return "";
  }

  return readFileSync(filePath, "utf8");
}

const policy = requireFile(policyPath, "MCP policy module");
const manifest = requireFile(manifestPath, "MCP manifest module");

function requireTokens(source, sourceLabel, tokens) {
  for (const token of tokens) {
    if (!source.includes(token)) {
      failures.push(`${sourceLabel} missing token: ${token}`);
    }
  }
}

requireTokens(policy, "policy.ts", [
  ...requiredTools,
  ...requiredResources,
  ...requiredPrompts,
  ...requiredErrorCodes,
  ...requiredLimits,
  ...requiredForbiddenTerms,
]);

requireTokens(manifest, "manifest.ts", [
  ...requiredTools,
  ...requiredResources,
  ...requiredPrompts,
]);

for (const term of forbiddenManifestTerms) {
  if (manifest.includes(term)) {
    failures.push(`Forbidden exposed MCP manifest term found: ${term}`);
  }
}

if (failures.length > 0) {
  console.error("MCP policy check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("MCP policy check passed.");
