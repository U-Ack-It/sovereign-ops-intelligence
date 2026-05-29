import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

import { parseRouteRequestBody, server } from "./server.js";

type TestResponse = {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: string;
};

function listenForTest(): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      assert.ok(typeof address === "object" && address !== null);
      resolve((address as AddressInfo).port);
    });
  });
}

function closeServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function requestJson(
  port: number,
  method: "GET" | "POST",
  path: string,
  body?: string,
): Promise<TestResponse> {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers:
          body === undefined
            ? { "x-request-id": "test-request-id" }
            : {
                "content-type": "application/json",
                "content-length": Buffer.byteLength(body),
                "x-request-id": "test-request-id",
              },
      },
      (response) => {
        let responseBody = "";

        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          responseBody += chunk;
        });
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode ?? 0,
            headers: response.headers,
            body: responseBody,
          });
        });
      },
    );

    request.on("error", reject);

    if (body !== undefined) {
      request.write(body);
    }

    request.end();
  });
}

function requestRaw(
  port: number,
  method: "GET" | "POST",
  path: string,
  body: string,
  contentType: string,
): Promise<TestResponse> {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: {
          "content-type": contentType,
          "content-length": Buffer.byteLength(body),
          "x-request-id": "test-request-id",
        },
      },
      (response) => {
        let responseBody = "";

        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          responseBody += chunk;
        });
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode ?? 0,
            headers: response.headers,
            body: responseBody,
          });
        });
      },
    );

    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

function assertJsonObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  assert.equal(typeof value, "object", `${label} should be an object`);
  assert.notEqual(value, null, `${label} should not be null`);
  assert.equal(Array.isArray(value), false, `${label} should not be an array`);
}

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string") {
    assert.fail(`${label} should be a string`);
  }

  assert.ok(value.length > 0, `${label} should not be empty`);
}

function assertStringArray(value: unknown, label: string): asserts value is string[] {
  assert.ok(Array.isArray(value), `${label} should be an array`);

  for (const item of value) {
    assertString(item, `${label} item`);
  }
}

function assertJsonResponse(response: TestResponse): void {
  assert.match(String(response.headers["content-type"]), /application\/json/);
}

function assertStructuredError(response: TestResponse, statusCode: number, code: string): void {
  assert.equal(response.statusCode, statusCode);
  assertJsonResponse(response);

  const body = JSON.parse(response.body) as Record<string, unknown>;
  assertJsonObject(body, "error response body");
  assertJsonObject(body.error, "error");

  assert.equal(body.error.code, code);
  assertString(body.error.message, "error.message");
  assertJsonObject(body.error.details, "error.details");
  assert.equal(body.error.requestId, "test-request-id");
}

function assertSkillShape(value: unknown): void {
  assertJsonObject(value, "skill");
  assertString(value.id, "skill.id");
  assertString(value.name, "skill.name");
  assertString(value.advisor, "skill.advisor");
  assertString(value.category, "skill.category");
  assertString(value.description, "skill.description");
  assertStringArray(value.inputHints, "skill.inputHints");
  assertString(value.outputType, "skill.outputType");
  assertString(value.riskLevel, "skill.riskLevel");
}

function assertPlanShape(value: unknown, advisor: string): void {
  assertJsonObject(value, "plan");
  assert.equal(value.advisor, advisor);
  assertString(value.category, "plan.category");
  assert.ok(["low", "medium", "high"].includes(String(value.confidence)));
  assertString(value.summary, "plan.summary");
  assert.ok(Array.isArray(value.steps), "plan.steps should be an array");
  assert.ok(value.steps.length > 0, "plan.steps should not be empty");
  assertStringArray(value.safeguards, "plan.safeguards");
  assert.ok(Array.isArray(value.missingInputs), "plan.missingInputs should be an array");

  for (const step of value.steps) {
    assertJsonObject(step, "plan step");
    assertString(step.id, "plan step.id");
    assert.equal(step.advisor, advisor);
    assertString(step.skillId, "plan step.skillId");
    assertString(step.title, "plan step.title");
    assertString(step.description, "plan step.description");
    assert.ok(["low", "medium", "high"].includes(String(step.priority)));
    assert.equal(typeof step.requiresHumanApproval, "boolean");
    assertString(step.expectedOutput, "plan step.expectedOutput");
    assertString(step.action, "plan step.action");
  }
}

function assertActionPlanShape(value: unknown, advisor: string): void {
  assertJsonObject(value, "actionPlan");
  assert.equal(value.advisor, advisor);
  assertString(value.category, "actionPlan.category");
  assertString(value.summary, "actionPlan.summary");
  assert.ok(Array.isArray(value.steps), "actionPlan.steps should be an array");
  assert.ok(value.steps.length > 0, "actionPlan.steps should not be empty");
  assert.ok(value.escalation === null || typeof value.escalation === "string");

  for (const step of value.steps) {
    assertJsonObject(step, "actionPlan step");
    assertString(step.id, "actionPlan step.id");
    assertString(step.skillId, "actionPlan step.skillId");
    assertString(step.title, "actionPlan step.title");
    assertString(step.objective, "actionPlan step.objective");
    assertStringArray(step.requiredInputs, "actionPlan step.requiredInputs");
    assertString(step.expectedOutput, "actionPlan step.expectedOutput");
    assert.equal(typeof step.requiresApproval, "boolean");
  }
}

function assertDryRunExecutionPlanShape(value: unknown): void {
  assertJsonObject(value, "execution");
  assert.equal(value.mode, "dry_run");
  assertString(value.advisor, "execution.advisor");
  assertString(value.category, "execution.category");
  assertString(value.skillId, "execution.skillId");
  assertString(value.skillName, "execution.skillName");
  assert.ok(["low", "medium", "high"].includes(String(value.risk)));
  assert.ok(["not_required", "recommended", "required"].includes(String(value.approval)));
  assertString(value.summary, "execution.summary");
  assert.ok(Array.isArray(value.steps), "execution.steps should be an array");
  assert.ok(value.steps.length > 0, "execution.steps should not be empty");
  assertStringArray(value.expectedOutputs, "execution.expectedOutputs");
  assertStringArray(value.blockedActions, "execution.blockedActions");
  assertJsonObject(value.audit, "execution.audit");

  for (const step of value.steps) {
    assertJsonObject(step, "execution step");
    assertString(step.stepId, "execution step.stepId");
    assertString(step.title, "execution step.title");
    assertString(step.description, "execution step.description");
    assert.equal(step.status, "planned");
  }
}

function assertSkillExecutionShape(value: unknown, expectedSkillId: string): void {
  assertJsonObject(value, "skill execution");
  assert.equal(value.skillId, expectedSkillId);
  assertString(value.advisor, "skill execution.advisor");
  assert.ok(["completed", "needs_input", "not_found"].includes(String(value.status)));
  assertString(value.summary, "skill execution.summary");
  assertStringArray(value.requiredInputs, "skill execution.requiredInputs");
  assertStringArray(value.missingInputs, "skill execution.missingInputs");
  assertStringArray(value.recommendedSteps, "skill execution.recommendedSteps");
  assertStringArray(value.riskFlags, "skill execution.riskFlags");
  assertString(value.handoffNotes, "skill execution.handoffNotes");
  assert.equal(value.requestId, "test-request-id");
}

function assertRouteSuccess(
  body: Record<string, unknown>,
  advisor: string,
  options: { expectRequestId?: boolean } = {},
): void {
  const expectRequestId = options.expectRequestId ?? true;
  const requiredKeys = [
    "advisor",
    "category",
    "confidence",
    "matchedKeywords",
    "reason",
    "nextAction",
    "skills",
    "plan",
    "actionPlan",
  ];

  if (expectRequestId) {
    requiredKeys.push("requestId");
  }

  for (const key of requiredKeys) {
    assert.ok(key in body, `Expected ${key}`);
  }

  assert.equal(body.advisor, advisor);
  if (expectRequestId) {
    assert.equal(body.requestId, "test-request-id");
  }
  assert.ok(Array.isArray(body.matchedKeywords));
  assert.ok(Array.isArray(body.skills));
  assert.ok(body.skills.length > 0);

  for (const skill of body.skills) {
    assertSkillShape(skill);
  }

  assertPlanShape(body.plan, advisor);
  assertActionPlanShape(body.actionPlan, advisor);
}

test("route request parser accepts valid message", () => {
  const valid = parseRouteRequestBody(
    JSON.stringify({ message: "contractor needs access to the property gate" }),
  );

  assert.equal(valid.ok, true);

  if (valid.ok) {
    assert.equal(valid.body.message, "contractor needs access to the property gate");
  }
});

test("route request parser rejects invalid JSON and missing input", () => {
  const invalidJson = parseRouteRequestBody("{");

  assert.equal(invalidJson.ok, false);

  if (!invalidJson.ok) {
    assert.equal(invalidJson.error.code, "INVALID_JSON");
  }

  const missingMessage = parseRouteRequestBody(JSON.stringify({ prompt: "hello" }));

  assert.equal(missingMessage.ok, false);

  if (!missingMessage.ok) {
    assert.equal(missingMessage.error.code, "INVALID_ROUTE_INPUT");
  }
});

test("health, ready, and version endpoints return 200", async () => {
  const port = await listenForTest();

  try {
    const health = await requestJson(port, "GET", "/health");
    const ready = await requestJson(port, "GET", "/ready");
    const version = await requestJson(port, "GET", "/version");

    assert.equal(health.statusCode, 200);
    assertJsonResponse(health);
    const healthBody = JSON.parse(health.body) as Record<string, unknown>;
    assert.equal(healthBody.status, "ok");
    assert.equal(healthBody.service, "sovereign-ops-api");
    assert.equal(healthBody.version, "0.1.0");
    assert.equal(typeof healthBody.timestamp, "string");

    assert.equal(ready.statusCode, 200);
    assertJsonResponse(ready);
    assert.deepEqual(JSON.parse(ready.body), {
      status: "ready",
      service: "sovereign-ops-api",
    });

    assert.equal(version.statusCode, 200);
    assertJsonResponse(version);
    const versionBody = JSON.parse(version.body) as Record<string, unknown>;
    assert.equal(versionBody.name, "sovereign-ops-api");
    assert.equal(versionBody.version, "0.1.0");
    assert.equal(typeof versionBody.nodeEnv, "string");
  } finally {
    await closeServer();
  }
});

test("invalid agents route bodies return structured 400 errors", async () => {
  const port = await listenForTest();

  try {
    const invalidJson = await requestJson(port, "POST", "/agents/route", "{");
    const missingBody = await requestJson(port, "POST", "/agents/route", "");
    const missingInput = await requestJson(port, "POST", "/agents/route", JSON.stringify({}));
    const emptyInput = await requestJson(port, "POST", "/agents/route", JSON.stringify({ message: "   " }));
    const nonStringInput = await requestJson(port, "POST", "/agents/route", JSON.stringify({ message: 123 }));
    const tooLongInput = await requestJson(
      port,
      "POST",
      "/agents/route",
      JSON.stringify({ message: "x".repeat(4_001) }),
    );
    const nonJson = await requestRaw(port, "POST", "/agents/route", "message=hello", "text/plain");

    assertStructuredError(invalidJson, 400, "INVALID_JSON");
    assertStructuredError(missingBody, 400, "MISSING_BODY");
    assertStructuredError(missingInput, 400, "INVALID_ROUTE_INPUT");
    assertStructuredError(emptyInput, 400, "INVALID_ROUTE_INPUT");
    assertStructuredError(nonStringInput, 400, "INVALID_ROUTE_INPUT");
    assertStructuredError(tooLongInput, 400, "INVALID_ROUTE_INPUT");
    assertStructuredError(nonJson, 400, "INVALID_CONTENT_TYPE");
  } finally {
    await closeServer();
  }
});

test("valid advisor route returns existing fields, plan, and requestId", async () => {
  const port = await listenForTest();

  try {
    const response = await requestJson(
      port,
      "POST",
      "/agents/route",
      JSON.stringify({ message: "Schedule maintenance for the property inspection." }),
    );

    assert.equal(response.statusCode, 200);
    assertJsonResponse(response);
    const body = JSON.parse(response.body) as Record<string, unknown>;

    assertRouteSuccess(body, "Estate Advisor");
    assert.equal(body.requestId, "test-request-id");
    assert.equal(response.headers["x-request-id"], "test-request-id");
  } finally {
    await closeServer();
  }
});

test("all advisor routes and fallback return stable route response shape", async () => {
  const port = await listenForTest();

  try {
    const cases = [
      ["Estate Advisor", "Schedule maintenance for the property inspection."],
      ["Security Advisor", "Review password access for the gate system."],
      ["Vendor Advisor", "Find a contractor vendor for pool service."],
      ["Concierge Advisor", "Plan lifestyle logistics for a family event."],
      ["Compliance Advisor", "Review contract privacy risk before approval."],
      ["Operations Advisor", "Please advise on the next best step."],
    ] as const;

    for (const [advisor, message] of cases) {
      const response = await requestJson(
        port,
        "POST",
        "/agents/route",
        JSON.stringify({ message }),
      );

      assert.equal(response.statusCode, 200);
      assertJsonResponse(response);
      assertRouteSuccess(JSON.parse(response.body) as Record<string, unknown>, advisor);
    }
  } finally {
    await closeServer();
  }
});

test("agents execute endpoint returns stable dry-run execution contract", async () => {
  const port = await listenForTest();

  try {
    const response = await requestJson(
      port,
      "POST",
      "/agents/execute",
      JSON.stringify({
        message: "The pool maintenance vendor missed the appointment again.",
        context: {
          property: "Miami residence",
          urgency: "medium",
        },
      }),
    );

    assert.equal(response.statusCode, 200);
    assertJsonResponse(response);

    const body = JSON.parse(response.body) as Record<string, unknown>;
    assert.equal(body.requestId, "test-request-id");
    assertJsonObject(body.route, "route");
    assertRouteSuccess(body.route, "Estate Advisor", { expectRequestId: false });
    assertDryRunExecutionPlanShape(body.execution);
  } finally {
    await closeServer();
  }
});

test("skill execute endpoint returns stable execution response contract", async () => {
  const port = await listenForTest();

  try {
    const response = await requestJson(
      port,
      "POST",
      "/agents/skills/execute",
      JSON.stringify({
        skillId: "maintenance_triage",
        context: {
          message: "Pool pump maintenance issue",
          urgency: "medium",
        },
      }),
    );

    assert.equal(response.statusCode, 200);
    assertJsonResponse(response);
    assertSkillExecutionShape(JSON.parse(response.body), "maintenance_triage");
  } finally {
    await closeServer();
  }
});

test("unknown route and unsupported method return structured errors", async () => {
  const port = await listenForTest();

  try {
    const unknown = await requestJson(port, "GET", "/missing");
    const unsupported = await requestJson(port, "GET", "/agents/route");

    assertStructuredError(unknown, 404, "NOT_FOUND");
    assertStructuredError(unsupported, 405, "UNSUPPORTED_METHOD");
  } finally {
    await closeServer();
  }
});
