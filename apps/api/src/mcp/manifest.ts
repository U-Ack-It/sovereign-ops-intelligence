import { MCP_POLICY_LIMITS } from "./policy.js";

export type McpToolDefinition = {
  name: string;
  title: string;
  purpose: string;
  inputSchema: {
    type: "object";
    required: string[];
    properties: Record<string, { type: "string"; minLength?: number; maxLength?: number }>;
    additionalProperties: false;
  };
};

export type McpResourceDefinition = {
  uri: string;
  name: string;
  title: string;
  description: string;
  mimeType: "text/plain" | "application/yaml";
};

export type McpPromptDefinition = {
  name: string;
  title: string;
  description: string;
  text: string;
};

export const SOVEREIGN_MCP_TOOLS: McpToolDefinition[] = [
  {
    name: "sovereign_advisor_route",
    title: "Sovereign Advisor Route",
    purpose: "Route an operator message to the best Sovereign Ops advisor.",
    inputSchema: {
      type: "object",
      required: ["input"],
      additionalProperties: false,
      properties: {
        input: { type: "string", minLength: 1, maxLength: MCP_POLICY_LIMITS.maxInputChars },
      },
    },
  },
  {
    name: "sovereign_advisor_execute",
    title: "Sovereign Advisor Execute",
    purpose: "Create a safe dry-run advisor execution result for an operator message.",
    inputSchema: {
      type: "object",
      required: ["input"],
      additionalProperties: false,
      properties: {
        input: { type: "string", minLength: 1, maxLength: MCP_POLICY_LIMITS.maxInputChars },
      },
    },
  },
  {
    name: "sovereign_skill_execute",
    title: "Sovereign Skill Execute",
    purpose: "Run one known advisor skill through the deterministic local skill executor.",
    inputSchema: {
      type: "object",
      required: ["skillId", "input"],
      additionalProperties: false,
      properties: {
        skillId: { type: "string", minLength: 1, maxLength: MCP_POLICY_LIMITS.maxSkillIdChars },
        input: { type: "string", minLength: 1, maxLength: MCP_POLICY_LIMITS.maxInputChars },
      },
    },
  },
];

export const SOVEREIGN_MCP_RESOURCES: McpResourceDefinition[] = [
  {
    uri: "sovereign://openapi",
    name: "sovereign-openapi",
    title: "Sovereign Ops OpenAPI Contract",
    description: "Read-only OpenAPI contract for the Sovereign Ops Advisor API.",
    mimeType: "application/yaml",
  },
  {
    uri: "sovereign://docs/architecture",
    name: "sovereign-architecture-doc",
    title: "Sovereign Ops Architecture",
    description: "Read-only architecture overview for the Sovereign Ops API.",
    mimeType: "text/plain",
  },
  {
    uri: "sovereign://docs/api",
    name: "sovereign-api-doc",
    title: "Sovereign Ops API Docs",
    description: "Read-only API usage notes for Sovereign Ops agent clients.",
    mimeType: "text/plain",
  },
];

export const SOVEREIGN_MCP_PROMPTS: McpPromptDefinition[] = [
  {
    name: "sovereign-operations-triage",
    title: "Sovereign Operations Triage",
    description: "Guide a client through safe property operations triage.",
    text: "Classify the property operations request, gather missing estate context, route with sovereign_advisor_route, then use dry-run outputs for human review.",
  },
  {
    name: "sovereign-security-review",
    title: "Sovereign Security Review",
    description: "Guide a client through cautious access and security review.",
    text: "Treat access and security requests as sensitive. Route first, collect role and approval context, and use dry-run results without changing credentials or access settings.",
  },
  {
    name: "sovereign-compliance-review",
    title: "Sovereign Compliance Review",
    description: "Guide a client through contract, privacy, and risk review.",
    text: "Route legal, contract, privacy, or risk requests to the compliance advisor. Use returned plans as review checklists, not binding advice or approval.",
  },
];
