import test from "node:test";
import assert from "node:assert/strict";
import {
  SOVEREIGN_MCP_PROMPTS,
  SOVEREIGN_MCP_RESOURCES,
  SOVEREIGN_MCP_TOOLS,
} from "./manifest.js";
import { createSovereignMcpServer } from "./server.js";

const expectedTools = [
  "sovereign_advisor_route",
  "sovereign_advisor_execute",
  "sovereign_skill_execute",
];

const expectedResources = [
  "sovereign://openapi",
  "sovereign://docs/architecture",
  "sovereign://docs/api",
];

const expectedPrompts = [
  "sovereign-operations-triage",
  "sovereign-security-review",
  "sovereign-compliance-review",
];

const forbiddenTerms = [
  "audit",
  "dashboard",
  "metrics",
  "admin",
  "secret",
  "password",
  "OTEL_EXPORTER_OTLP_HEADERS",
  "SOVEREIGN_ADMIN_API_KEY",
];

test("MCP manifest exposes the expected safe tools, resources, and prompts", () => {
  assert.deepEqual(
    SOVEREIGN_MCP_TOOLS.map((tool) => tool.name),
    expectedTools,
  );
  assert.deepEqual(
    SOVEREIGN_MCP_RESOURCES.map((resource) => resource.uri),
    expectedResources,
  );
  assert.deepEqual(
    SOVEREIGN_MCP_PROMPTS.map((prompt) => prompt.name),
    expectedPrompts,
  );
});

test("MCP manifest does not expose internal visibility surfaces or sensitive env names", () => {
  const manifestText = JSON.stringify({
    tools: SOVEREIGN_MCP_TOOLS,
    resources: SOVEREIGN_MCP_RESOURCES,
    prompts: SOVEREIGN_MCP_PROMPTS,
  });
  const lowerManifest = manifestText.toLowerCase();

  for (const term of forbiddenTerms) {
    assert.equal(
      lowerManifest.includes(term.toLowerCase()),
      false,
      `MCP manifest should not contain ${term}`,
    );
  }
});

test("MCP tool input schemas require string inputs", () => {
  const routeTool = SOVEREIGN_MCP_TOOLS.find((tool) => tool.name === "sovereign_advisor_route");
  const advisorExecuteTool = SOVEREIGN_MCP_TOOLS.find(
    (tool) => tool.name === "sovereign_advisor_execute",
  );
  const skillExecuteTool = SOVEREIGN_MCP_TOOLS.find(
    (tool) => tool.name === "sovereign_skill_execute",
  );

  assert.ok(routeTool);
  assert.deepEqual(routeTool.inputSchema.required, ["input"]);
  assert.equal(routeTool.inputSchema.properties.input.type, "string");

  assert.ok(advisorExecuteTool);
  assert.deepEqual(advisorExecuteTool.inputSchema.required, ["input"]);
  assert.equal(advisorExecuteTool.inputSchema.properties.input.type, "string");

  assert.ok(skillExecuteTool);
  assert.deepEqual(skillExecuteTool.inputSchema.required, ["skillId", "input"]);
  assert.equal(skillExecuteTool.inputSchema.properties.skillId.type, "string");
  assert.equal(skillExecuteTool.inputSchema.properties.input.type, "string");
});

test("MCP server module can be imported and constructed without starting stdio", () => {
  const server = createSovereignMcpServer();
  assert.equal(typeof server.connect, "function");
  assert.equal(typeof server.close, "function");
});
