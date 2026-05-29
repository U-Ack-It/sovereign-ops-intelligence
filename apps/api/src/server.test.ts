import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

import { clearApiAuditEvents, listApiAuditEvents } from "./agents/audit-trail.js";
import { parseRouteRequestBody, server } from "./server.js";

type TestResponse = {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: string;
};

type RequestOptions = {
  requestId?: string | null;
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
  options: RequestOptions = {},
): Promise<TestResponse> {
  const requestId = options.requestId === undefined ? "test-request-id" : options.requestId;
  const headers: Record<string, string | number> =
    body === undefined
      ? {}
      : {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
        };

  if (requestId !== null) {
    headers["x-request-id"] = requestId;
  }

  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers,
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
  options: RequestOptions = {},
): Promise<TestResponse> {
  const requestId = options.requestId === undefined ? "test-request-id" : options.requestId;
  const headers: Record<string, string | number> = {
    "content-type": contentType,
    "content-length": Buffer.byteLength(body),
  };

  if (requestId !== null) {
    headers["x-request-id"] = requestId;
  }

  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers,
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

function assertRequestIdHeader(response: TestResponse, expectedRequestId = "test-request-id"): void {
  assert.equal(response.headers["x-request-id"], expectedRequestId);
}

function assertGeneratedRequestId(value: unknown, label: string): asserts value is string {
  assertString(value, label);
  assert.match(value, /^req_[a-z0-9]+_[a-z0-9]+$/);
}

function assertStructuredError(
  response: TestResponse,
  statusCode: number,
  code: string,
  expectedRequestId = "test-request-id",
): void {
  assert.equal(response.statusCode, statusCode);
  assertJsonResponse(response);
  assertRequestIdHeader(response, expectedRequestId);

  const body = JSON.parse(response.body) as Record<string, unknown>;
  assertJsonObject(body, "error response body");
  assertJsonObject(body.error, "error");

  assert.equal(body.error.code, code);
  assertString(body.error.message, "error.message");
  assertJsonObject(body.error.details, "error.details");
  assert.equal(body.error.requestId, expectedRequestId);
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

function assertAuditEventShape(value: unknown): void {
  assertJsonObject(value, "audit event");
  assertString(value.id, "audit event.id");
  assertString(value.requestId, "audit event.requestId");
  assertString(value.timestamp, "audit event.timestamp");
  assertString(value.method, "audit event.method");
  assertString(value.route, "audit event.route");
  assert.ok(
    ["advisor.route", "advisor.execute", "skill.execute", "api.error"].includes(String(value.eventType)),
  );
  assert.ok(["success", "error"].includes(String(value.status)));

  if ("inputSummary" in value) {
    assertString(value.inputSummary, "audit event.inputSummary");
    assert.ok(value.inputSummary.length <= 160);
  }

  if ("selectedSkillIds" in value) {
    assertStringArray(value.selectedSkillIds, "audit event.selectedSkillIds");
  }

  if ("planStepCount" in value) {
    assert.equal(typeof value.planStepCount, "number");
  }

  if ("actionPlanStepCount" in value) {
    assert.equal(typeof value.actionPlanStepCount, "number");
  }

  if ("errorCode" in value) {
    assertString(value.errorCode, "audit event.errorCode");
  }
}

function assertDashboardShape(value: unknown): void {
  assertJsonObject(value, "dashboard");
  assert.equal(value.status, "ok");
  assertString(value.generatedAt, "dashboard.generatedAt");
  assert.ok(Array.isArray(value.advisors), "dashboard.advisors should be an array");
  assert.ok(value.advisors.length > 0, "dashboard.advisors should not be empty");
  assertJsonObject(value.audit, "dashboard.audit");
  const audit = value.audit;
  assert.ok(Array.isArray(audit.recentEvents), "dashboard.audit.recentEvents should be an array");
  assertJsonObject(audit.stats, "dashboard.audit.stats");

  for (const advisor of value.advisors) {
    assertJsonObject(advisor, "dashboard advisor");
    assertString(advisor.id, "dashboard advisor.id");
    assertString(advisor.name, "dashboard advisor.name");
    assertString(advisor.description, "dashboard advisor.description");
    assert.equal(typeof advisor.skillCount, "number");
    assert.ok(Number(advisor.skillCount) > 0, "dashboard advisor.skillCount should be positive");
    assertString(advisor.riskLevel, "dashboard advisor.riskLevel");
    assert.equal(typeof advisor.requiresHumanApproval, "boolean");
  }

  for (const field of [
    "totalEvents",
    "successCount",
    "errorCount",
    "advisorRouteCount",
    "advisorExecuteCount",
    "skillExecuteCount",
    "apiErrorCount",
  ]) {
    assert.equal(typeof audit.stats[field], "number", `dashboard audit stats ${field}`);
  }

  for (const event of audit.recentEvents) {
    assertAuditEventShape(event);
  }
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
    assertRequestIdHeader(health);
    const healthBody = JSON.parse(health.body) as Record<string, unknown>;
    assert.equal(healthBody.status, "ok");
    assert.equal(healthBody.service, "sovereign-ops-api");
    assert.equal(healthBody.version, "0.1.0");
    assert.equal(typeof healthBody.timestamp, "string");

    assert.equal(ready.statusCode, 200);
    assertJsonResponse(ready);
    assertRequestIdHeader(ready);
    assert.deepEqual(JSON.parse(ready.body), {
      status: "ready",
      service: "sovereign-ops-api",
    });

    assert.equal(version.statusCode, 200);
    assertJsonResponse(version);
    assertRequestIdHeader(version);
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
    assertRequestIdHeader(response);
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
    assertRequestIdHeader(response);

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
    assertRequestIdHeader(response);
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

test("client-provided request ids are preserved on success and error responses", async () => {
  const port = await listenForTest();
  const requestId = "client-request-gate-6";

  try {
    const health = await requestJson(port, "GET", "/health", undefined, { requestId });
    const ready = await requestJson(port, "GET", "/ready", undefined, { requestId });
    const version = await requestJson(port, "GET", "/version", undefined, { requestId });
    const route = await requestJson(
      port,
      "POST",
      "/agents/route",
      JSON.stringify({ message: "Schedule maintenance for the property inspection." }),
      { requestId },
    );
    const execute = await requestJson(
      port,
      "POST",
      "/agents/execute",
      JSON.stringify({
        message: "The pool maintenance vendor missed the appointment again.",
        context: { urgency: "medium" },
      }),
      { requestId },
    );
    const skillExecute = await requestJson(
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
      { requestId },
    );
    const invalidJson = await requestJson(port, "POST", "/agents/route", "{", { requestId });
    const missingInput = await requestJson(
      port,
      "POST",
      "/agents/route",
      JSON.stringify({}),
      { requestId },
    );
    const unknownRoute = await requestJson(port, "GET", "/missing", undefined, { requestId });
    const unsupportedMethod = await requestJson(port, "GET", "/agents/route", undefined, { requestId });

    for (const response of [health, ready, version, route, execute, skillExecute]) {
      assert.equal(response.statusCode, 200);
      assertJsonResponse(response);
      assertRequestIdHeader(response, requestId);
    }

    assert.equal((JSON.parse(route.body) as Record<string, unknown>).requestId, requestId);
    assert.equal((JSON.parse(execute.body) as Record<string, unknown>).requestId, requestId);
    assert.equal((JSON.parse(skillExecute.body) as Record<string, unknown>).requestId, requestId);

    assertStructuredError(invalidJson, 400, "INVALID_JSON", requestId);
    assertStructuredError(missingInput, 400, "INVALID_ROUTE_INPUT", requestId);
    assertStructuredError(unknownRoute, 404, "NOT_FOUND", requestId);
    assertStructuredError(unsupportedMethod, 405, "UNSUPPORTED_METHOD", requestId);
  } finally {
    await closeServer();
  }
});

test("missing request id generates a non-empty request id on responses", async () => {
  const port = await listenForTest();

  try {
    const health = await requestJson(port, "GET", "/health", undefined, { requestId: null });
    const invalidJson = await requestJson(port, "POST", "/agents/route", "{", { requestId: null });

    assert.equal(health.statusCode, 200);
    assertJsonResponse(health);
    assertGeneratedRequestId(health.headers["x-request-id"], "generated success x-request-id");

    const healthBody = JSON.parse(health.body) as Record<string, unknown>;
    assert.equal(healthBody.status, "ok");

    assert.equal(invalidJson.statusCode, 400);
    assertJsonResponse(invalidJson);
    assertGeneratedRequestId(invalidJson.headers["x-request-id"], "generated error x-request-id");

    const body = JSON.parse(invalidJson.body) as Record<string, unknown>;
    assertJsonObject(body.error, "generated error");
    assert.equal(body.error.code, "INVALID_JSON");
    assert.equal(body.error.requestId, invalidJson.headers["x-request-id"]);
  } finally {
    await closeServer();
  }
});

test("advisor and skill endpoints record in-memory audit events", async () => {
  clearApiAuditEvents();
  const port = await listenForTest();
  const longInput = `Schedule maintenance ${"for the west guest house ".repeat(12)}`;

  try {
    const route = await requestJson(
      port,
      "POST",
      "/agents/route",
      JSON.stringify({ message: longInput }),
      { requestId: "audit-route-request" },
    );
    const execute = await requestJson(
      port,
      "POST",
      "/agents/execute",
      JSON.stringify({
        message: "The pool maintenance vendor missed the appointment again.",
        context: { urgency: "medium" },
      }),
      { requestId: "audit-execute-request" },
    );
    const skillExecute = await requestJson(
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
      { requestId: "audit-skill-request" },
    );
    const invalidInput = await requestJson(
      port,
      "POST",
      "/agents/route",
      JSON.stringify({ message: "" }),
      { requestId: "audit-error-request" },
    );

    assert.equal(route.statusCode, 200);
    assert.equal(execute.statusCode, 200);
    assert.equal(skillExecute.statusCode, 200);
    assert.equal(invalidInput.statusCode, 400);

    const events = listApiAuditEvents({ limit: 10 });

    assert.equal(events.length, 4);
    assert.deepEqual(
      events.map((event) => event.eventType),
      ["api.error", "skill.execute", "advisor.execute", "advisor.route"],
    );

    const routeEvent = events.find((event) => event.eventType === "advisor.route");
    const executeEvent = events.find((event) => event.eventType === "advisor.execute");
    const skillEvent = events.find((event) => event.eventType === "skill.execute");
    const errorEvent = events.find((event) => event.eventType === "api.error");

    assert.ok(routeEvent);
    assert.equal(routeEvent.requestId, "audit-route-request");
    assert.equal(routeEvent.method, "POST");
    assert.equal(routeEvent.route, "/agents/route");
    assert.equal(routeEvent.status, "success");
    assert.equal(routeEvent.advisor, "Estate Advisor");
    assert.ok(routeEvent.inputSummary);
    assert.equal(routeEvent.inputSummary.length, 160);
    assert.ok(!routeEvent.inputSummary.includes("undefined"));
    assert.ok(Array.isArray(routeEvent.selectedSkillIds));
    assert.ok(routeEvent.selectedSkillIds.length > 0);
    assert.ok((routeEvent.planStepCount ?? 0) > 0);
    assert.ok((routeEvent.actionPlanStepCount ?? 0) > 0);

    assert.ok(executeEvent);
    assert.equal(executeEvent.requestId, "audit-execute-request");
    assert.equal(executeEvent.eventType, "advisor.execute");
    assert.equal(executeEvent.status, "success");
    assert.equal(executeEvent.advisor, "Estate Advisor");
    assert.ok(Array.isArray(executeEvent.selectedSkillIds));
    assert.ok(executeEvent.selectedSkillIds.length > 0);

    assert.ok(skillEvent);
    assert.equal(skillEvent.requestId, "audit-skill-request");
    assert.equal(skillEvent.eventType, "skill.execute");
    assert.equal(skillEvent.status, "success");
    assert.equal(skillEvent.advisor, "Estate Advisor");
    assert.deepEqual(skillEvent.selectedSkillIds, ["maintenance_triage"]);

    assert.ok(errorEvent);
    assert.equal(errorEvent.requestId, "audit-error-request");
    assert.equal(errorEvent.eventType, "api.error");
    assert.equal(errorEvent.status, "error");
    assert.equal(errorEvent.errorCode, "INVALID_ROUTE_INPUT");
  } finally {
    await closeServer();
    clearApiAuditEvents();
  }
});

test("audit endpoint returns newest events first with limit and request id", async () => {
  clearApiAuditEvents();
  const port = await listenForTest();

  try {
    await requestJson(
      port,
      "POST",
      "/agents/route",
      JSON.stringify({ message: "Schedule maintenance for the property inspection." }),
      { requestId: "audit-list-first" },
    );
    await requestJson(
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
      { requestId: "audit-list-second" },
    );

    const response = await requestJson(
      port,
      "GET",
      "/agents/audit?limit=1",
      undefined,
      { requestId: "audit-list-request" },
    );

    assert.equal(response.statusCode, 200);
    assertJsonResponse(response);
    assertRequestIdHeader(response, "audit-list-request");

    const body = JSON.parse(response.body) as Record<string, unknown>;
    assert.ok(Array.isArray(body.events));
    assert.equal(body.events.length, 1);
    assertAuditEventShape(body.events[0]);
    assertJsonObject(body.events[0], "latest audit event");
    assert.equal(body.events[0].eventType, "skill.execute");
    assert.equal(body.events[0].requestId, "audit-list-second");
  } finally {
    await closeServer();
    clearApiAuditEvents();
  }
});

test("dashboard endpoint returns advisor summary, audit stats, and does not record reads", async () => {
  clearApiAuditEvents();
  const port = await listenForTest();

  try {
    await requestJson(
      port,
      "POST",
      "/agents/route",
      JSON.stringify({ message: "Schedule maintenance for the property inspection." }),
      { requestId: "dashboard-first" },
    );
    await requestJson(
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
      { requestId: "dashboard-second" },
    );

    const beforeReadCount = listApiAuditEvents({ limit: 100 }).length;
    const response = await requestJson(
      port,
      "GET",
      "/agents/dashboard?limit=1",
      undefined,
      { requestId: "dashboard-request" },
    );
    const afterReadCount = listApiAuditEvents({ limit: 100 }).length;

    assert.equal(response.statusCode, 200);
    assertJsonResponse(response);
    assertRequestIdHeader(response, "dashboard-request");
    assert.equal(afterReadCount, beforeReadCount);

    const body = JSON.parse(response.body) as Record<string, unknown>;
    assertDashboardShape(body.dashboard);
    assertJsonObject(body.dashboard, "dashboard body");
    const dashboard = body.dashboard;
    assertJsonObject(dashboard.audit, "dashboard audit");
    const audit = dashboard.audit;
    assert.ok(Array.isArray(audit.recentEvents));
    assert.equal(audit.recentEvents.length, 1);
    assertJsonObject(audit.recentEvents[0], "dashboard latest event");
    assert.equal(audit.recentEvents[0].requestId, "dashboard-second");
    assertJsonObject(audit.stats, "dashboard stats");
    assert.equal(audit.stats.totalEvents, 2);
    assert.equal(audit.stats.successCount, 2);
    assert.equal(audit.stats.errorCount, 0);
    assert.equal(audit.stats.advisorRouteCount, 1);
    assert.equal(audit.stats.advisorExecuteCount, 0);
    assert.equal(audit.stats.skillExecuteCount, 1);
    assert.equal(audit.stats.apiErrorCount, 0);
  } finally {
    await closeServer();
    clearApiAuditEvents();
  }
});
