import http from "node:http";

import { server } from "../dist/server.js";

const ROUTE_PATH = "/agents/route";
const SKILL_EXECUTE_PATH = "/agents/skills/execute";
const AUDIT_PATH = "/agents/audit";
const DASHBOARD_PATH = "/agents/dashboard";
const METRICS_PATH = "/agents/metrics";
const host = "127.0.0.1";
let port = 0;

const cases = [
  {
    name: "Estate Advisor",
    payload: { message: "Schedule maintenance for the property inspection." },
    expected: {
      advisor: "Estate Advisor",
      category: "property/staff/maintenance",
      keyword: "maintenance",
    },
  },
  {
    name: "Security Advisor",
    payload: { message: "Review password access for the gate system." },
    expected: {
      advisor: "Security Advisor",
      category: "passwords/access/security",
      keyword: "password",
    },
  },
  {
    name: "Vendor Advisor",
    payload: { message: "Find a contractor vendor for pool service." },
    expected: {
      advisor: "Vendor Advisor",
      category: "contractors/vendors",
      keyword: "contractor",
    },
  },
  {
    name: "Concierge Advisor",
    payload: { message: "Plan lifestyle logistics for a family event." },
    expected: {
      advisor: "Concierge Advisor",
      category: "lifestyle/logistics",
      keyword: "lifestyle",
    },
  },
  {
    name: "Compliance Advisor",
    payload: { message: "Review contract privacy risk before approval." },
    expected: {
      advisor: "Compliance Advisor",
      category: "contracts/risk/legal/privacy",
      keyword: "contract",
    },
  },
  {
    name: "Operations Advisor fallback",
    payload: { message: "Please advise on the next step." },
    expected: {
      advisor: "Operations Advisor",
      category: "unknown/unclear",
    },
  },
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function postJson(path, payload) {
  const body = JSON.stringify(payload);
  return postRaw(path, body, "application/json");
}

function postRaw(path, body, contentType) {

  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: host,
        port,
        path,
        method: "POST",
        headers: {
          "content-type": contentType,
          "content-length": Buffer.byteLength(body),
          "x-request-id": `smoke-${path.replaceAll("/", "-")}`,
        },
      },
      (response) => {
        let responseBody = "";

        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          responseBody += chunk;
        });
        response.on("end", () => {
          resolve({ statusCode: response.statusCode, body: responseBody });
        });
      },
    );

    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

function getJson(path) {
  const headers = {
    "x-request-id": `smoke-${path.replaceAll("/", "-")}`,
  };

  if (
    process.env.SOVEREIGN_ADMIN_API_KEY &&
    (path.startsWith(AUDIT_PATH) ||
      path.startsWith(DASHBOARD_PATH) ||
      path.startsWith(METRICS_PATH))
  ) {
    headers["x-admin-api-key"] = process.env.SOVEREIGN_ADMIN_API_KEY;
  }

  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: host,
        port,
        path,
        method: "GET",
        headers,
      },
      (response) => {
        let responseBody = "";

        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          responseBody += chunk;
        });
        response.on("end", () => {
          resolve({ statusCode: response.statusCode, body: responseBody });
        });
      },
    );

    request.on("error", reject);
    request.end();
  });
}

function postRoute(payload) {
  return postJson(ROUTE_PATH, payload);
}

function postSkillExecution(payload) {
  return postJson(SKILL_EXECUTE_PATH, payload);
}

function assertRouteResponse(caseName, response, expected) {
  assert(
    response.statusCode === 200,
    `${caseName}: expected HTTP 200, got ${response.statusCode}`,
  );

  const parsed = JSON.parse(response.body);

  for (const key of [
    "advisor",
    "category",
    "confidence",
    "matchedKeywords",
    "reason",
    "nextAction",
    "skills",
    "plan",
    "actionPlan",
  ]) {
    assert(key in parsed, `${caseName}: expected response to include ${key}`);
  }

  assert(
    parsed.advisor === expected.advisor,
    `${caseName}: expected advisor ${expected.advisor}, got ${parsed.advisor}`,
  );
  assert(
    typeof parsed.advisor === "string" && parsed.advisor.endsWith("Advisor"),
    `${caseName}: expected deterministic advisor name`,
  );
  assert(
    parsed.category === expected.category,
    `${caseName}: expected category ${expected.category}, got ${parsed.category}`,
  );
  assert(
    Array.isArray(parsed.skills) && parsed.skills.length > 0,
    `${caseName}: expected non-empty skills`,
  );
  assert(parsed.requestId, `${caseName}: expected requestId`);

  if (expected.keyword) {
    assert(
      Array.isArray(parsed.matchedKeywords) &&
        parsed.matchedKeywords.includes(expected.keyword),
      `${caseName}: expected matchedKeywords to include ${expected.keyword}`,
    );
  }

  assert(parsed.plan, `${caseName}: expected plan`);
  assert(
    parsed.plan.advisor === parsed.advisor,
    `${caseName}: expected plan advisor ${parsed.advisor}, got ${parsed.plan.advisor}`,
  );
  assert(
    Array.isArray(parsed.plan.steps) && parsed.plan.steps.length > 0,
    `${caseName}: expected non-empty plan.steps`,
  );
  assert(parsed.actionPlan, `${caseName}: expected actionPlan`);
  assert(
    parsed.actionPlan.advisor === parsed.advisor,
    `${caseName}: expected actionPlan advisor ${parsed.advisor}, got ${parsed.actionPlan.advisor}`,
  );
  assert(
    Array.isArray(parsed.actionPlan.steps) && parsed.actionPlan.steps.length > 0,
    `${caseName}: expected non-empty actionPlan.steps`,
  );

  if ("executionPlan" in parsed) {
    assert(
      parsed.executionPlan &&
        Array.isArray(parsed.executionPlan.steps) &&
        parsed.executionPlan.steps.length > 0,
      `${caseName}: expected non-empty executionPlan.steps`,
    );
  }

  return parsed;
}

async function assertStatusEndpoint(path, expectedStatus) {
  const response = await getJson(path);

  assert(
    response.statusCode === 200,
    `${path}: expected HTTP 200, got ${response.statusCode}`,
  );

  const parsed = JSON.parse(response.body);

  assert(
    parsed.status === expectedStatus || path === "/version",
    `${path}: expected status ${expectedStatus}`,
  );

  if (path === "/health") {
    assert(parsed.service === "sovereign-ops-api", "/health: expected service name");
    assert(parsed.version, "/health: expected version");
    assert(parsed.timestamp, "/health: expected timestamp");
  }

  if (path === "/version") {
    assert(parsed.name, "/version: expected package name");
    assert(parsed.version, "/version: expected version");
    assert("nodeEnv" in parsed, "/version: expected nodeEnv");
  }
}

async function assertInvalidRouteCase(name, response, expectedCode) {
  assert(
    response.statusCode === 400,
    `${name}: expected HTTP 400, got ${response.statusCode}`,
  );

  const parsed = JSON.parse(response.body);

  assert(parsed.error, `${name}: expected error`);
  assert(
    parsed.error.code === expectedCode,
    `${name}: expected ${expectedCode}, got ${parsed.error.code}`,
  );
  assert(parsed.error.message, `${name}: expected error message`);
  assert(parsed.error.details, `${name}: expected error details`);
}

function assertSkillExecutionResponse(caseName, response, expectedSkillId, options = {}) {
  const parsed = JSON.parse(response.body);

  if (options.expectsApproval) {
    assert(
      response.statusCode === 409,
      `${caseName}: expected approval-required HTTP 409, got ${response.statusCode}`,
    );
    assert(parsed.error, `${caseName}: expected approval error body`);
    assert(
      parsed.error.code === "ACTION_REQUIRES_APPROVAL",
      `${caseName}: expected ACTION_REQUIRES_APPROVAL, got ${parsed.error.code}`,
    );
    assert(parsed.error.requestId, `${caseName}: expected approval error requestId`);
    return;
  }

  assert(
    response.statusCode === 200,
    `${caseName}: expected skill execution HTTP 200, got ${response.statusCode}`,
  );

  assert(parsed.skillId, `${caseName}: expected skill execution skillId`);
  assert(
    parsed.skillId === expectedSkillId,
    `${caseName}: expected skill execution for ${expectedSkillId}, got ${parsed.skillId}`,
  );
  assert(
    parsed.status === "completed" || parsed.status === "needs_input",
    `${caseName}: expected completed or needs_input skill status, got ${parsed.status}`,
  );
  assert(
    Array.isArray(parsed.recommendedSteps),
    `${caseName}: expected skill execution recommendedSteps array`,
  );
  assert(parsed.actionPolicy, `${caseName}: expected actionPolicy in skill execution`);
  assert(
    ["allow", "audit_only"].includes(parsed.actionPolicy.decision),
    `${caseName}: expected safe action policy decision, got ${parsed.actionPolicy.decision}`,
  );
}

async function assertAuditEndpoint() {
  const response = await getJson(`${AUDIT_PATH}?limit=5`);

  assert(
    response.statusCode === 200,
    `/agents/audit: expected HTTP 200, got ${response.statusCode}`,
  );

  const parsed = JSON.parse(response.body);

  assert(Array.isArray(parsed.events), "/agents/audit: expected events array");
  assert(parsed.events.length > 0, "/agents/audit: expected at least one audit event");

  for (const event of parsed.events) {
    assert(event.id, "/agents/audit: expected event.id");
    assert(event.requestId, "/agents/audit: expected event.requestId");
    assert(event.timestamp, "/agents/audit: expected event.timestamp");
    assert(event.method, "/agents/audit: expected event.method");
    assert(event.route, "/agents/audit: expected event.route");
    assert(event.eventType, "/agents/audit: expected event.eventType");
    assert(event.status, "/agents/audit: expected event.status");
  }
}

async function assertDashboardEndpoint() {
  const response = await getJson(`${DASHBOARD_PATH}?limit=5`);

  assert(
    response.statusCode === 200,
    `/agents/dashboard: expected HTTP 200, got ${response.statusCode}`,
  );

  const parsed = JSON.parse(response.body);

  assert(parsed.dashboard, "/agents/dashboard: expected dashboard");
  assert(parsed.dashboard.status === "ok", "/agents/dashboard: expected ok status");
  assert(
    Array.isArray(parsed.dashboard.advisors),
    "/agents/dashboard: expected advisors array",
  );
  assert(
    parsed.dashboard.advisors.length > 0,
    "/agents/dashboard: expected at least one advisor",
  );
  assert(
    parsed.dashboard.audit && typeof parsed.dashboard.audit.stats === "object",
    "/agents/dashboard: expected audit stats object",
  );
}

async function assertMetricsEndpoint() {
  const response = await getJson(METRICS_PATH);

  assert(
    response.statusCode === 200,
    `/agents/metrics: expected HTTP 200, got ${response.statusCode}`,
  );

  const parsed = JSON.parse(response.body);

  assert(parsed.metrics, "/agents/metrics: expected metrics");
  assert(
    parsed.metrics.process && typeof parsed.metrics.process === "object",
    "/agents/metrics: expected process metrics",
  );
  assert(
    parsed.metrics.http && typeof parsed.metrics.http === "object",
    "/agents/metrics: expected http metrics",
  );
  assert(
    parsed.metrics.audit && typeof parsed.metrics.audit === "object",
    "/agents/metrics: expected audit metrics",
  );
}

await new Promise((resolve) => {
  server.listen(0, host, () => {
    const address = server.address();
    assert(
      typeof address === "object" && address !== null,
      "Expected smoke server address",
    );
    port = address.port;
    resolve();
  });
});

try {
  await assertStatusEndpoint("/health", "ok");
  console.log("PASS /health");
  await assertStatusEndpoint("/ready", "ready");
  console.log("PASS /ready");
  await assertStatusEndpoint("/version", "");
  console.log("PASS /version");

  await assertInvalidRouteCase(
    "Invalid route input",
    await postJson(ROUTE_PATH, { message: "" }),
    "INVALID_ROUTE_INPUT",
  );
  console.log("PASS invalid input");

  await assertInvalidRouteCase(
    "Malformed JSON",
    await postRaw(ROUTE_PATH, "{", "application/json"),
    "INVALID_JSON",
  );
  console.log("PASS malformed JSON");

  for (const smokeCase of cases) {
    const response = await postRoute(smokeCase.payload);
    const routeResult = assertRouteResponse(smokeCase.name, response, smokeCase.expected);
    const firstSkill = routeResult.skills[0];

    const skillResponse = await postSkillExecution({
      skillId: firstSkill.id,
      context: {
        message: smokeCase.payload.message,
        advisor: routeResult.advisor,
        category: routeResult.category,
        urgency: "medium",
      },
    });

    assertSkillExecutionResponse(smokeCase.name, skillResponse, firstSkill.id, {
      expectsApproval: ["Security Advisor", "Compliance Advisor"].includes(routeResult.advisor),
    });
    console.log(`PASS ${smokeCase.name}`);
  }

  await assertAuditEndpoint();
  console.log("PASS /agents/audit");

  await assertDashboardEndpoint();
  console.log("PASS /agents/dashboard");

  await assertMetricsEndpoint();
  console.log("PASS /agents/metrics");
} finally {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
