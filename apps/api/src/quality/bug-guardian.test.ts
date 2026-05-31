import test from "node:test";
import assert from "node:assert/strict";

import { classifyChangedFiles, createBugGuardianPlan } from "./bug-guardian.js";

test("agent file changes require agent tests and smoke", () => {
  const result = classifyChangedFiles(["apps/api/src/agents/orchestrator.ts"]);

  assert.equal(result.riskLevel, "high");
  assert.ok(result.requiredChecks.includes("npm run test:agents"));
  assert.ok(result.requiredChecks.includes("npm run smoke"));
});

test("package, tsconfig, and script changes require typecheck and smoke", () => {
  const result = classifyChangedFiles([
    "apps/api/package.json",
    "apps/api/tsconfig.json",
    "apps/api/scripts/smoke-route.mjs",
  ]);

  assert.equal(result.riskLevel, "medium");
  assert.ok(result.requiredChecks.includes("npm run typecheck"));
  assert.ok(result.requiredChecks.includes("npm run smoke"));
});

test("unrelated docs change is low risk", () => {
  const result = classifyChangedFiles(["docs/gates/gate-2-bug-sentinel.md"]);

  assert.equal(result.riskLevel, "low");
});

test("mixed changes use the highest applicable risk", () => {
  const result = classifyChangedFiles([
    "docs/readme.md",
    "apps/api/package.json",
    "apps/api/src/agents/skills.ts",
  ]);

  assert.equal(result.riskLevel, "high");
});

test("empty changes remain low risk but allow full verification", () => {
  const result = createBugGuardianPlan([]);

  assert.equal(result.riskLevel, "low");
  assert.equal(result.runFullVerify, true);
  assert.ok(result.requiredChecks.includes("python scaffold tests"));
  assert.ok(result.requiredChecks.includes("npm run typecheck"));
  assert.ok(result.requiredChecks.includes("npm run test:agents"));
  assert.ok(result.requiredChecks.includes("npm run smoke"));
});
