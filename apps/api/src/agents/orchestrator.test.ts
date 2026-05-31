import test from "node:test";
import assert from "node:assert/strict";

import { orchestrateAgentRequest } from "./orchestrator.js";
import { getSkillById } from "./skills.js";

function route(prompt: string) {
  return orchestrateAgentRequest({
    prompt,
    tenantId: "tenant-1",
    estateId: "estate-1",
    actorUserId: "user-1",
    actorRole: "OWNER",
  });
}

function assertRoutePlan(prompt: string, advisor: string, category: string, expectedKeyword: string) {
  const result = route(prompt);
  const skillIds = new Set(result.skills.map((skill) => skill.id));

  assert.equal(result.advisor, advisor);
  assert.equal(result.category, category);
  assert.ok(result.matchedKeywords.includes(expectedKeyword));
  assert.ok(result.skills.length > 0);
  assert.ok(result.skills.every((skill) => skill.advisor === advisor));
  assert.ok(result.plan);
  assert.equal(result.plan.advisor, result.advisor);
  assert.equal(result.plan.category, result.category);
  assert.equal(result.plan.confidence, result.confidence);
  assert.ok(result.plan.steps.length > 0);

  for (const step of result.plan.steps) {
    assert.ok(skillIds.has(step.skillId), `Expected plan step skill ${step.skillId}`);
  }

  return result;
}

test("each advisor route returns a plan using returned skills", () => {
  assertRoutePlan(
    "Schedule staff maintenance for the west guest house.",
    "Estate Advisor",
    "property/staff/maintenance",
    "staff",
  );

  assertRoutePlan(
    "Reset the gate access password.",
    "Security Advisor",
    "passwords/access/security",
    "password",
  );

  assertRoutePlan(
    "Find an HVAC vendor for service.",
    "Vendor Advisor",
    "contractors/vendors",
    "vendor",
  );

  assertRoutePlan(
    "Book a chef for a lifestyle event.",
    "Concierge Advisor",
    "lifestyle/logistics",
    "lifestyle",
  );

  assertRoutePlan(
    "Review legal privacy risk in the contract.",
    "Compliance Advisor",
    "contracts/risk/legal/privacy",
    "contract",
  );
});

test("Security Advisor plan includes a human approval step", () => {
  const result = route("Reset the gate access password.");

  assert.equal(result.advisor, "Security Advisor");
  assert.ok(result.plan.steps.some((step) => step.requiresHumanApproval));
});

test("Compliance Advisor plan includes a human approval step", () => {
  const result = route("Review legal privacy risk in the contract.");

  assert.equal(result.advisor, "Compliance Advisor");
  assert.ok(result.plan.steps.some((step) => step.requiresHumanApproval));
});

test("Operations Advisor fallback returns a useful plan", () => {
  const result = route("Please advise on the next best step.");
  const skillIds = new Set(result.skills.map((skill) => skill.id));

  assert.equal(result.advisor, "Operations Advisor");
  assert.equal(result.category, "unknown/unclear");
  assert.equal(result.matchedKeywords.length, 0);
  assert.ok(result.skills.length > 0);
  assert.ok(result.plan);
  assert.equal(result.plan.advisor, "Operations Advisor");
  assert.ok(result.plan.steps.length > 0);
  assert.ok(result.plan.missingInputs.includes("objective"));

  for (const step of result.plan.steps) {
    assert.ok(skillIds.has(step.skillId), `Expected fallback plan step skill ${step.skillId}`);
  }
});

test("unknown skill id returns undefined", () => {
  assert.equal(getSkillById("missing_skill"), undefined);
});
