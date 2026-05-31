import test from "node:test";
import assert from "node:assert/strict";

import { orchestrateAgentRequest } from "./orchestrator.js";

const routeCases = [
  {
    prompt: "Schedule maintenance for the property inspection.",
    advisor: "Estate Advisor",
  },
  {
    prompt: "Review password access for the gate system.",
    advisor: "Security Advisor",
  },
  {
    prompt: "Find a contractor vendor for pool service.",
    advisor: "Vendor Advisor",
  },
  {
    prompt: "Plan lifestyle logistics for a family event.",
    advisor: "Concierge Advisor",
  },
  {
    prompt: "Review contract privacy risk before approval.",
    advisor: "Compliance Advisor",
  },
  {
    prompt: "Please advise on the next step.",
    advisor: "Operations Advisor",
  },
];

function route(prompt: string) {
  return orchestrateAgentRequest({
    prompt,
    tenantId: "tenant-1",
    estateId: "estate-1",
    actorUserId: "user-1",
    actorRole: "OWNER",
  });
}

function assertStableRouteShape(result: ReturnType<typeof route>) {
  assert.equal(typeof result.advisor, "string");
  assert.equal(typeof result.category, "string");
  assert.ok(["low", "medium", "high"].includes(result.confidence));
  assert.ok(Array.isArray(result.matchedKeywords));
  assert.equal(typeof result.reason, "string");
  assert.equal(typeof result.nextAction, "string");
  assert.ok(Array.isArray(result.skills));
  assert.ok(result.skills.length > 0, `${result.advisor} returned empty skills`);
  assert.ok(result.plan);
}

function assertStablePlanShape(result: ReturnType<typeof route>) {
  assert.equal(result.plan.advisor, result.advisor);
  assert.ok(Array.isArray(result.plan.steps));
  assert.ok(result.plan.steps.length > 0);

  for (const step of result.plan.steps) {
    assert.equal(typeof step.id, "string");
    assert.ok(step.id.length > 0);
    assert.equal(typeof step.title, "string");
    assert.ok(step.title.length > 0);
    assert.ok(["low", "medium", "high"].includes(step.priority));
    assert.equal(typeof step.action, "string");
    assert.ok(step.action.length > 0);
  }
}

test("advisor route response contract remains stable", () => {
  for (const routeCase of routeCases) {
    const result = route(routeCase.prompt);

    assert.equal(result.advisor, routeCase.advisor);
    assertStableRouteShape(result);
    assertStablePlanShape(result);
  }
});

test("fallback route returns Operations Advisor", () => {
  const result = route("Please advise on the next step.");

  assert.equal(result.advisor, "Operations Advisor");
  assert.equal(result.category, "unknown/unclear");
  assertStableRouteShape(result);
  assertStablePlanShape(result);
});
