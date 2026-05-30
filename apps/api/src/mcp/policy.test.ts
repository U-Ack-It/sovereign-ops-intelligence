import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  MCP_ALLOWED_PROMPTS,
  MCP_ALLOWED_RESOURCES,
  MCP_ALLOWED_TOOLS,
  MCP_POLICY_LIMITS,
  McpPolicyError,
  assertAllowedPrompt,
  assertAllowedResource,
  assertAllowedTool,
  assertInputBudget,
  assertSafeText,
  assertSkillIdBudget,
  getMcpPolicySnapshot,
  recordToolInvocation,
  resetMcpPolicyState,
} from "./policy.js";
import {
  SOVEREIGN_MCP_PROMPTS,
  SOVEREIGN_MCP_RESOURCES,
  SOVEREIGN_MCP_TOOLS,
} from "./manifest.js";

beforeEach(() => {
  resetMcpPolicyState();
});

function assertPolicyCode(fn: () => void, code: string): McpPolicyError {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof McpPolicyError);
    assert.equal(error.code, code);
    return true;
  });

  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof McpPolicyError);
    return error;
  }

  throw new Error("Expected policy error.");
}

test("allowed tools, resources, and prompts pass policy checks", () => {
  assert.doesNotThrow(() => assertAllowedTool("sovereign_advisor_route"));
  assert.doesNotThrow(() => assertAllowedResource("sovereign://openapi"));
  assert.doesNotThrow(() => assertAllowedPrompt("sovereign-security-review"));
});

test("unknown tools, resources, and prompts fail closed", () => {
  assertPolicyCode(() => assertAllowedTool("unknown_tool"), "MCP_TOOL_NOT_ALLOWED");
  assertPolicyCode(() => assertAllowedResource("sovereign://agents/audit"), "MCP_RESOURCE_NOT_ALLOWED");
  assertPolicyCode(() => assertAllowedPrompt("unknown-prompt"), "MCP_PROMPT_NOT_ALLOWED");
});

test("oversized tool input and skill id fail", () => {
  assertPolicyCode(
    () =>
      assertInputBudget(
        "sovereign_advisor_route",
        "x".repeat(MCP_POLICY_LIMITS.maxInputChars + 1),
      ),
    "MCP_INPUT_TOO_LONG",
  );

  assertPolicyCode(
    () => assertSkillIdBudget("x".repeat(MCP_POLICY_LIMITS.maxSkillIdChars + 1)),
    "MCP_INPUT_TOO_LONG",
  );
});

test("forbidden text fails without echoing the forbidden value", () => {
  const error = assertPolicyCode(
    () => assertSafeText("test-input", "contains SOVEREIGN_ADMIN_API_KEY material"),
    "MCP_FORBIDDEN_TEXT",
  );

  assert.equal(error.message.includes("SOVEREIGN_ADMIN_API_KEY"), false);
});

test("per-session and per-minute tool budgets work", () => {
  for (let index = 0; index < MCP_POLICY_LIMITS.maxToolCallsPerMinute; index += 1) {
    recordToolInvocation("sovereign_advisor_route", 1_000);
  }

  assertPolicyCode(
    () => recordToolInvocation("sovereign_advisor_route", 1_000),
    "MCP_RATE_LIMIT_EXCEEDED",
  );

  resetMcpPolicyState();

  for (let index = 0; index < MCP_POLICY_LIMITS.maxToolCallsPerSession; index += 1) {
    recordToolInvocation("sovereign_advisor_route", index * 61_000);
  }

  assertPolicyCode(
    () => recordToolInvocation("sovereign_advisor_route", 99_000_000),
    "MCP_TOOL_BUDGET_EXCEEDED",
  );
});

test("resetMcpPolicyState resets counters", () => {
  recordToolInvocation("sovereign_advisor_route", 1_000);
  assert.equal(getMcpPolicySnapshot().sessionToolCalls, 1);

  resetMcpPolicyState();
  assert.equal(getMcpPolicySnapshot().sessionToolCalls, 0);
  assert.equal(getMcpPolicySnapshot().callsInCurrentMinute, 0);
});

test("manifest exposes only policy-allowed tools, resources, and prompts", () => {
  assert.deepEqual(
    SOVEREIGN_MCP_TOOLS.map((tool) => tool.name),
    [...MCP_ALLOWED_TOOLS],
  );
  assert.deepEqual(
    SOVEREIGN_MCP_RESOURCES.map((resource) => resource.uri),
    [...MCP_ALLOWED_RESOURCES],
  );
  assert.deepEqual(
    SOVEREIGN_MCP_PROMPTS.map((prompt) => prompt.name),
    [...MCP_ALLOWED_PROMPTS],
  );
});

test("admin visibility surfaces are not exposed by the MCP manifest", () => {
  const manifestText = JSON.stringify({
    tools: SOVEREIGN_MCP_TOOLS,
    resources: SOVEREIGN_MCP_RESOURCES,
    prompts: SOVEREIGN_MCP_PROMPTS,
  }).toLowerCase();

  for (const term of ["audit", "dashboard", "metrics", "/agents/audit", "/agents/dashboard", "/agents/metrics"]) {
    assert.equal(manifestText.includes(term), false, `Unexpected MCP manifest term: ${term}`);
  }
});
