import { readFileSync } from "node:fs";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";

import { verifyAdminRequest } from "./admin-auth.js";
import { ApiAuditEventType, ApiAuditStatus, listApiAuditEvents, recordApiAuditEvent } from "./agents/audit-trail.js";
import { buildAdvisorDashboardSummary } from "./agents/dashboard.js";
import { executeFirstSkillForRoute } from "./agents/executor.js";
import { orchestrateAgentRequest } from "./agents/orchestrator.js";
import { SkillExecutionContext, executeSkill } from "./agents/skill-executor.js";

const PORT = Number(process.env.PORT ?? 3000);
const MAX_BODY_BYTES = 1_000_000;
const MAX_ROUTE_INPUT_CHARS = 4_000;
const SERVICE_NAME = "sovereign-ops-api";

type RouteRequestBody = {
  message: string;
  context?: Record<string, unknown>;
};

type JsonResponse = Record<string, unknown>;

type ParsedError = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

type SkillExecuteRequestBody = {
  skillId: string;
  context: SkillExecutionContext;
};

type PackageMetadata = {
  name?: string;
  version?: string;
};

class HttpRequestError extends Error {
  readonly statusCode: number;
  readonly apiError: ParsedError;

  constructor(statusCode: number, apiError: ParsedError) {
    super(apiError.message);
    this.statusCode = statusCode;
    this.apiError = apiError;
  }
}

function getPackageMetadata(): PackageMetadata {
  try {
    const rawPackage = readFileSync(new URL("../package.json", import.meta.url), "utf8");
    const parsed = JSON.parse(rawPackage) as PackageMetadata;

    return {
      name: parsed.name,
      version: parsed.version,
    };
  } catch {
    return {};
  }
}

function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function requestIdFromHeader(request: IncomingMessage): string {
  const header = request.headers["x-request-id"];

  if (Array.isArray(header)) {
    return header.find((value) => value.trim()) ?? generateRequestId();
  }

  if (typeof header === "string" && header.trim()) {
    return header.trim();
  }

  return generateRequestId();
}

function logRequest(requestId: string, method: string | undefined, url: string | undefined, statusCode: number): void {
  console.log(`[${requestId}] ${method ?? "UNKNOWN"} ${url ?? "/"} ${statusCode}`);
}

function requestPathFromUrl(url: string | undefined): string {
  try {
    return new URL(url ?? "/", "http://local").pathname;
  } catch {
    return url ?? "/";
  }
}

function auditLimitFromUrl(url: string | undefined): number {
  try {
    const parsed = new URL(url ?? "/", "http://local");
    const rawLimit = parsed.searchParams.get("limit");

    if (rawLimit === null) {
      return 25;
    }

    return Number(rawLimit);
  } catch {
    return 25;
  }
}

function safeRecordApiAuditEvent(input: {
  requestId: string;
  method: string;
  route: string;
  eventType: ApiAuditEventType;
  status: ApiAuditStatus;
  advisor?: string;
  inputSummary?: string;
  selectedSkillIds?: string[];
  planStepCount?: number;
  actionPlanStepCount?: number;
  errorCode?: string;
}): void {
  try {
    recordApiAuditEvent(input);
  } catch {
    // Audit recording must never block the API response path.
  }
}

function isJsonRequest(request: IncomingMessage): boolean {
  const contentType = request.headers["content-type"];

  if (Array.isArray(contentType)) {
    return contentType.some((value) => value.toLowerCase().includes("application/json"));
  }

  return typeof contentType === "string" && contentType.toLowerCase().includes("application/json");
}

export function parseRouteRequestBody(rawBody: string):
  | { ok: true; body: RouteRequestBody }
  | { ok: false; error: ParsedError } {
  let parsed: unknown;

  if (!rawBody.trim()) {
    return {
      ok: false,
      error: {
        code: "MISSING_BODY",
        message: "Request body is required.",
      },
    };
  }

  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return {
      ok: false,
      error: {
        code: "INVALID_JSON",
        message: "Invalid JSON body.",
      },
    };
  }

  if (
    typeof parsed !== "object" ||
    parsed === null
  ) {
    return {
      ok: false,
      error: {
        code: "INVALID_BODY",
        message: "Request body must be a JSON object.",
      },
    };
  }

  const rawInput =
    "message" in parsed
      ? parsed.message
      : "query" in parsed
        ? parsed.query
        : undefined;

  if (typeof rawInput !== "string") {
    return {
      ok: false,
      error: {
        code: "INVALID_ROUTE_INPUT",
        message: "Request body must include a message or query field.",
        details: {
          expectedFields: ["message", "query"],
        },
      },
    };
  }

  const message = rawInput.trim();

  if (!message) {
    return {
      ok: false,
      error: {
        code: "INVALID_ROUTE_INPUT",
        message: "Route message cannot be empty.",
        details: {
          reason: "empty_string",
        },
      },
    };
  }

  if (message.length > MAX_ROUTE_INPUT_CHARS) {
    return {
      ok: false,
      error: {
        code: "INVALID_ROUTE_INPUT",
        message: `Route message cannot exceed ${MAX_ROUTE_INPUT_CHARS} characters.`,
        details: {
          maxLength: MAX_ROUTE_INPUT_CHARS,
        },
      },
    };
  }

  return { ok: true, body: { message } };
}

export function parseExecuteRequestBody(rawBody: string):
  | { ok: true; body: RouteRequestBody }
  | { ok: false; error: ParsedError } {
  const parsed = parseRouteRequestBody(rawBody);

  if (!parsed.ok) {
    return parsed;
  }

  const rawParsed = JSON.parse(rawBody) as { context?: unknown };

  if (
    "context" in rawParsed &&
    (typeof rawParsed.context !== "object" ||
      rawParsed.context === null ||
      Array.isArray(rawParsed.context))
  ) {
    return {
      ok: false,
      error: {
        code: "INVALID_CONTEXT",
        message: "Invalid context.",
      },
    };
  }

  return {
    ok: true,
    body: {
      message: parsed.body.message,
      context: rawParsed.context as Record<string, unknown> | undefined,
    },
  };
}

export function parseSkillExecuteRequestBody(rawBody: string):
  | { ok: true; body: SkillExecuteRequestBody }
  | { ok: false; error: ParsedError } {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return {
      ok: false,
      error: {
        code: "INVALID_JSON",
        message: "Invalid JSON body.",
      },
    };
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("skillId" in parsed) ||
    typeof parsed.skillId !== "string" ||
    !parsed.skillId.trim()
  ) {
    return {
      ok: false,
      error: {
        code: "INVALID_SKILL_INPUT",
        message: "Missing skillId.",
      },
    };
  }

  const rawContext = "context" in parsed ? parsed.context : {};

  if (
    typeof rawContext !== "object" ||
    rawContext === null ||
    Array.isArray(rawContext)
  ) {
    return {
      ok: false,
      error: {
        code: "INVALID_CONTEXT",
        message: "Invalid context.",
      },
    };
  }

  return {
    ok: true,
    body: {
      skillId: parsed.skillId,
      context: rawContext as SkillExecutionContext,
    },
  };
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: JsonResponse,
  requestId?: string,
): void {
  const headers: Record<string, string> = { "content-type": "application/json" };

  if (requestId) {
    headers["x-request-id"] = requestId;
  }

  response.writeHead(statusCode, headers);
  response.end(JSON.stringify(payload));
}

function sendError(
  response: ServerResponse,
  statusCode: number,
  error: ParsedError,
  requestId: string,
  auditContext?: {
    method: string;
    route: string;
  },
): void {
  if (auditContext) {
    safeRecordApiAuditEvent({
      requestId,
      method: auditContext.method,
      route: auditContext.route,
      eventType: "api.error",
      status: "error",
      errorCode: error.code,
    });
  }

  sendJson(
    response,
    statusCode,
    {
      error: {
        code: error.code,
        message: error.message,
        details: error.details ?? {},
        requestId,
      },
    },
    requestId,
  );
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";

    request.setEncoding("utf8");

    request.on("data", (chunk: string) => {
      body += chunk;

      if (body.length > MAX_BODY_BYTES) {
        reject(
          new HttpRequestError(400, {
            code: "REQUEST_BODY_TOO_LARGE",
            message: "Request body is too large.",
            details: {
              maxBytes: MAX_BODY_BYTES,
            },
          }),
        );
        request.destroy();
      }
    });

    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

async function handleAgentsRoute(
  request: IncomingMessage,
  response: ServerResponse,
  requestId: string,
): Promise<void> {
  const auditContext = {
    method: request.method ?? "UNKNOWN",
    route: requestPathFromUrl(request.url),
  };

  if (!isJsonRequest(request)) {
    sendError(
      response,
      400,
      {
        code: "INVALID_CONTENT_TYPE",
        message: "POST /agents/route requires application/json.",
        details: {
          expected: "application/json",
        },
      },
      requestId,
      auditContext,
    );
    return;
  }

  const rawBody = await readBody(request);
  const parsed = parseRouteRequestBody(rawBody);

  if (!parsed.ok) {
    sendError(response, 400, parsed.error, requestId, auditContext);
    return;
  }

  const routeResult = orchestrateAgentRequest({
    prompt: parsed.body.message,
    tenantId: "local",
    actorUserId: "api",
    actorRole: "OWNER",
  });

  safeRecordApiAuditEvent({
    requestId,
    method: auditContext.method,
    route: auditContext.route,
    eventType: "advisor.route",
    status: "success",
    advisor: routeResult.advisor,
    inputSummary: parsed.body.message,
    selectedSkillIds: routeResult.skills.map((skill) => skill.id),
    planStepCount: routeResult.plan.steps.length,
    actionPlanStepCount: routeResult.actionPlan.steps.length,
  });

  sendJson(response, 200, { ...routeResult, requestId }, requestId);
}

async function handleAgentsExecute(
  request: IncomingMessage,
  response: ServerResponse,
  requestId: string,
): Promise<void> {
  const auditContext = {
    method: request.method ?? "UNKNOWN",
    route: requestPathFromUrl(request.url),
  };
  const rawBody = await readBody(request);
  const parsed = parseExecuteRequestBody(rawBody);

  if (!parsed.ok) {
    sendError(response, 400, parsed.error, requestId, auditContext);
    return;
  }

  const route = orchestrateAgentRequest({
    prompt: parsed.body.message,
    tenantId: "local",
    actorUserId: "api",
    actorRole: "OWNER",
  });
  const execution = executeFirstSkillForRoute(route, {
    message: parsed.body.message,
    context: parsed.body.context,
  });

  safeRecordApiAuditEvent({
    requestId,
    method: auditContext.method,
    route: auditContext.route,
    eventType: "advisor.execute",
    status: "success",
    advisor: route.advisor,
    inputSummary: parsed.body.message,
    selectedSkillIds: [execution.skillId],
    planStepCount: execution.steps.length,
  });

  sendJson(response, 200, { requestId, route, execution }, requestId);
}

async function handleAgentsSkillExecute(
  request: IncomingMessage,
  response: ServerResponse,
  requestId: string,
): Promise<void> {
  const auditContext = {
    method: request.method ?? "UNKNOWN",
    route: requestPathFromUrl(request.url),
  };
  const rawBody = await readBody(request);
  const parsed = parseSkillExecuteRequestBody(rawBody);

  if (!parsed.ok) {
    sendError(response, 400, parsed.error, requestId, auditContext);
    return;
  }

  const execution = executeSkill(parsed.body.skillId, parsed.body.context);
  safeRecordApiAuditEvent({
    requestId,
    method: auditContext.method,
    route: auditContext.route,
    eventType: "skill.execute",
    status: "success",
    advisor: execution.advisor,
    inputSummary: parsed.body.context.message,
    selectedSkillIds: [execution.skillId],
  });

  sendJson(response, 200, { ...execution, requestId }, requestId);
}

export const server = createServer(async (request, response) => {
  const requestId = requestIdFromHeader(request);
  const packageMetadata = getPackageMetadata();
  const requestPath = requestPathFromUrl(request.url);

  try {
    if (request.method === "GET" && requestPath === "/health") {
      sendJson(
        response,
        200,
        {
          status: "ok",
          service: SERVICE_NAME,
          version: packageMetadata.version ?? null,
          timestamp: new Date().toISOString(),
        },
        requestId,
      );
      logRequest(requestId, request.method, request.url, 200);
      return;
    }

    if (request.method === "GET" && requestPath === "/ready") {
      sendJson(response, 200, { status: "ready", service: SERVICE_NAME }, requestId);
      logRequest(requestId, request.method, request.url, 200);
      return;
    }

    if (request.method === "GET" && requestPath === "/version") {
      sendJson(
        response,
        200,
        {
          name: packageMetadata.name ?? null,
          version: packageMetadata.version ?? null,
          nodeEnv: process.env.NODE_ENV ?? "development",
        },
        requestId,
      );
      logRequest(requestId, request.method, request.url, 200);
      return;
    }

    if (request.method === "GET" && requestPath === "/agents/audit") {
      const adminAuth = verifyAdminRequest(request);

      if (!adminAuth.ok) {
        sendError(response, adminAuth.statusCode, adminAuth.error, requestId, {
          method: request.method ?? "UNKNOWN",
          route: requestPath,
        });
        logRequest(requestId, request.method, request.url, adminAuth.statusCode);
        return;
      }

      sendJson(
        response,
        200,
        {
          events: listApiAuditEvents({ limit: auditLimitFromUrl(request.url) }),
        },
        requestId,
      );
      logRequest(requestId, request.method, request.url, 200);
      return;
    }

    if (request.method === "GET" && requestPath === "/agents/dashboard") {
      const adminAuth = verifyAdminRequest(request);

      if (!adminAuth.ok) {
        sendError(response, adminAuth.statusCode, adminAuth.error, requestId, {
          method: request.method ?? "UNKNOWN",
          route: requestPath,
        });
        logRequest(requestId, request.method, request.url, adminAuth.statusCode);
        return;
      }

      sendJson(
        response,
        200,
        {
          dashboard: buildAdvisorDashboardSummary({
            limit: auditLimitFromUrl(request.url),
          }),
        },
        requestId,
      );
      logRequest(requestId, request.method, request.url, 200);
      return;
    }

    if (request.method === "POST" && requestPath === "/agents/route") {
      await handleAgentsRoute(request, response, requestId);
      logRequest(requestId, request.method, request.url, response.statusCode);
      return;
    }

    if (request.method === "POST" && requestPath === "/agents/execute") {
      await handleAgentsExecute(request, response, requestId);
      logRequest(requestId, request.method, request.url, response.statusCode);
      return;
    }

    if (request.method === "POST" && requestPath === "/agents/skills/execute") {
      await handleAgentsSkillExecute(request, response, requestId);
      logRequest(requestId, request.method, request.url, response.statusCode);
      return;
    }

    const knownPaths = new Set([
      "/health",
      "/ready",
      "/version",
      "/agents/route",
      "/agents/execute",
      "/agents/skills/execute",
      "/agents/audit",
      "/agents/dashboard",
    ]);

    if (knownPaths.has(requestPath)) {
      sendError(
        response,
        405,
        {
          code: "UNSUPPORTED_METHOD",
          message: `Method ${request.method ?? "UNKNOWN"} is not supported for ${request.url}.`,
          details: {
            method: request.method,
            path: requestPath,
          },
        },
        requestId,
        {
          method: request.method ?? "UNKNOWN",
          route: requestPath,
        },
      );
      logRequest(requestId, request.method, request.url, 405);
      return;
    }

    sendError(
      response,
      404,
      {
        code: "NOT_FOUND",
        message: "Not found.",
        details: {
          path: request.url ?? null,
        },
      },
      requestId,
      {
        method: request.method ?? "UNKNOWN",
        route: requestPath,
      },
    );
    logRequest(requestId, request.method, request.url, 404);
  } catch (error) {
    if (error instanceof HttpRequestError) {
      sendError(response, error.statusCode, error.apiError, requestId, {
        method: request.method ?? "UNKNOWN",
        route: requestPath,
      });
      logRequest(requestId, request.method, request.url, error.statusCode);
      return;
    }

    sendError(
      response,
      500,
      {
        code: "INTERNAL_ERROR",
        message: "Internal server error.",
        details: {},
      },
      requestId,
      {
        method: request.method ?? "UNKNOWN",
        route: requestPath,
      },
    );
    logRequest(requestId, request.method, request.url, 500);
  }
});

const isMainModule = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isMainModule) {
  server.listen(PORT, () => {
    console.log(`API server listening on http://localhost:${PORT}`);
  });
}
