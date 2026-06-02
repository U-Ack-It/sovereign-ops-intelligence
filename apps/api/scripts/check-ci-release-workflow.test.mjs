import test from "node:test";
import assert from "node:assert/strict";

import { validateCiReleaseWorkflow } from "./check-ci-release-workflow.mjs";

const validWorkflow = `
name: API Stability
permissions:
  contents: read
concurrency:
  group: api-stability
  cancel-in-progress: true
jobs:
  api-stability:
    steps:
      - uses: actions/setup-node@v4
        with:
          cache-dependency-path: apps/api/package-lock.json
      - run: npm ci
      - env:
          SOVEREIGN_ADMIN_API_KEY: ci-release-verification-admin-key-12345
        run: npm run verify:release
`;

const validPackageJson = JSON.stringify({
  scripts: {
    "ci:check": "node scripts/check-ci-release-workflow.mjs",
    "verify:release":
      "npm run ci:check && npm run docs:check && npm run openapi:check && npm run verify:mcp && SOVEREIGN_ADMIN_API_KEY= npm run verify && npm run verify:production",
  },
});

test("CI release workflow check passes for the guarded release path", () => {
  const result = validateCiReleaseWorkflow({
    workflowSource: validWorkflow,
    packageJsonSource: validPackageJson,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
});

test("CI release workflow check fails when workflow stops running verify:release", () => {
  const result = validateCiReleaseWorkflow({
    workflowSource: validWorkflow.replace("npm run verify:release", "npm run verify"),
    packageJsonSource: validPackageJson,
  });

  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /npm run verify:release/);
});

test("CI release workflow check fails when release script drops OpenAPI drift coverage", () => {
  const result = validateCiReleaseWorkflow({
    workflowSource: validWorkflow,
    packageJsonSource: validPackageJson.replace("npm run openapi:check && ", ""),
  });

  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /openapi:check/);
});

test("CI release workflow check fails when normal verify does not clear admin key", () => {
  const result = validateCiReleaseWorkflow({
    workflowSource: validWorkflow,
    packageJsonSource: validPackageJson.replace("SOVEREIGN_ADMIN_API_KEY= npm run verify", "npm run verify"),
  });

  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /SOVEREIGN_ADMIN_API_KEY= npm run verify/);
});

test("CI release workflow check fails when package JSON is invalid", () => {
  const result = validateCiReleaseWorkflow({
    workflowSource: validWorkflow,
    packageJsonSource: "{",
  });

  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /not valid JSON/);
});
