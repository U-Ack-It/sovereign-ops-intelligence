import test from "node:test";
import assert from "node:assert/strict";

import {
  collectServerRoutes,
  getOpenApiPathBlock,
  validateOpenApiRoutes,
} from "./check-openapi-routes.mjs";

const serverSource = `
const staticAllowedMethods = new Map<string, string[]>([
  ["/health", ["GET"]],
  ["/agents/route", ["POST"]],
  ["/agents/audit", ["GET"]],
]);
if (path.startsWith("/agents/approvals/")) {
  return ["GET", "POST"];
}
`;

const openApiSource = `
paths:
  /health:
    get:
      responses: {}
  /agents/route:
    post:
      responses: {}
  /agents/audit:
    get:
      security:
        - ApiKeyAuth: []
      responses: {}
  /agents/approvals/{approvalId}:
    get:
      security:
        - ApiKeyAuth: []
      responses: {}
  /agents/approvals/{approvalId}/approve:
    post:
      security:
        - ApiKeyAuth: []
      responses: {}
  /agents/approvals/{approvalId}/reject:
    post:
      security:
        - ApiKeyAuth: []
      responses: {}
  /agents/approvals/{approvalId}/execute:
    post:
      security:
        - ApiKeyAuth: []
      responses: {}
`;

test("collectServerRoutes extracts static and dynamic approval routes deterministically", () => {
  const routes = collectServerRoutes(serverSource);

  assert.deepEqual(routes.map((route) => route.path), [
    "/agents/approvals/{approvalId}",
    "/agents/approvals/{approvalId}/approve",
    "/agents/approvals/{approvalId}/execute",
    "/agents/approvals/{approvalId}/reject",
    "/agents/audit",
    "/agents/route",
    "/health",
  ]);
});

test("getOpenApiPathBlock returns a single path block", () => {
  const block = getOpenApiPathBlock(openApiSource, "/agents/audit");

  assert.ok(block);
  assert.match(block, /ApiKeyAuth/);
  assert.doesNotMatch(block, /\/agents\/approvals/);
});

test("valid OpenAPI route coverage passes", () => {
  const result = validateOpenApiRoutes({ serverSource, openApiSource });

  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
});

test("missing OpenAPI path fails", () => {
  const result = validateOpenApiRoutes({
    serverSource,
    openApiSource: openApiSource.replace("  /agents/route:\n    post:\n      responses: {}\n", ""),
  });

  assert.equal(result.ok, false);
  assert.ok(result.failures.includes("OpenAPI missing path: /agents/route"));
});

test("missing OpenAPI method fails", () => {
  const result = validateOpenApiRoutes({
    serverSource,
    openApiSource: openApiSource.replace("    post:", "    get:"),
  });

  assert.equal(result.ok, false);
  assert.ok(result.failures.includes("OpenAPI path /agents/route missing method: POST"));
});

test("admin OpenAPI paths must declare ApiKeyAuth", () => {
  const result = validateOpenApiRoutes({
    serverSource,
    openApiSource: openApiSource.replace("      security:\n        - ApiKeyAuth: []\n", ""),
  });

  assert.equal(result.ok, false);
  assert.ok(result.failures.includes("OpenAPI admin path /agents/audit missing ApiKeyAuth security"));
});
