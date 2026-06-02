import { readFileSync } from "node:fs";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { AddressInfo } from "node:net";
import { pathToFileURL } from "node:url";

import { evaluateActionPolicy, type ActionPolicyResult } from "./action-policy.js";
import {
  createApprovalRecord,
  decideApprovalRecord,
  expirePendingApprovalRecords,
  getApprovalRecord,
  getApprovalSummary,
  listApprovalRecords,
  markApprovalRecordExecuted,
} from "./approvals.js";
import { verifyAdminRequest } from "./admin-auth.js";
import { ApiAuditEventType, ApiAuditStatus, listApiAuditEvents, recordApiAuditEvent } from "./agents/audit-trail.js";
import { buildAdvisorDashboardSummary } from "./agents/dashboard.js";
import { executeFirstSkillForRoute } from "./agents/executor.js";
import { orchestrateAgentRequest } from "./agents/orchestrator.js";
import { SkillExecutionContext, executeSkill } from "./agents/skill-executor.js";
import { getApiMetricsSnapshot, recordHttpRequestMetric, recordTelemetryEvent } from "./observability.js";
import { initializeOtelExportIfEnabled, shutdownOtelExport } from "./otel-exporter.js";

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

type ApprovalDecisionRequestBody = {
  reason?: string;
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

function logRequest(
  requestId: string,
  method: string | undefined,
  url: string | undefined,
  statusCode: number,
  startedAtMs: number,
): void {
  try {
    recordHttpRequestMetric({
      requestId,
      method,
      route: metricRouteLabel(url),
      statusCode,
      durationMs: Date.now() - startedAtMs,
    });
  } catch {
    // Metrics recording must never block the API response path.
  }

  console.log(`[${requestId}] ${method ?? "UNKNOWN"} ${url ?? "/"} ${statusCode}`);
}

function requestPathFromUrl(url: string | undefined): string {
  try {
    return new URL(url ?? "/", "http://local").pathname;
  } catch {
    return url ?? "/";
  }
}

function metricRouteLabel(url: string | undefined): string {
  const path = requestPathFromUrl(url);
  const knownMetricRoutes = new Set([
    "/health",
    "/ready",
    "/version",
    "/agents/audit",
    "/agents/dashboard",
    "/agents/metrics",
    "/agents/approvals",
    "/agents/route",
    "/agents/execute",
    "/agents/skills/execute",
  ]);

  if (path.startsWith("/agents/approvals/")) {
    return "/agents/approvals";
  }

  return knownMetricRoutes.has(path) ? path : "unknown";
}

function limitFromUrl(url: string | undefined): number {
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
  actionPolicyDecision?: string;
}): void {
  try {
    recordApiAuditEvent(input);
    recordTelemetryEvent({
      eventType: input.eventType,
      requestId: input.requestId,
      method: input.method,
      route: input.route,
      advisor: input.advisor,
      errorCode: input.errorCode,
      actionPolicyDecision: input.actionPolicyDecision,
    });
  } catch {
    // Audit and telemetry recording must never block the API response path.
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

export function parseApprovalDecisionRequestBody(rawBody: string):
  | { ok: true; body: ApprovalDecisionRequestBody }
  | { ok: false; error: ParsedError } {
  if (!rawBody.trim()) {
    return { ok: true, body: {} };
  }

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

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {
      ok: false,
      error: {
        code: "INVALID_BODY",
        message: "Request body must be a JSON object.",
      },
    };
  }

  const body = parsed as Record<string, unknown>;

  if ("reason" in body && body.reason !== undefined && typeof body.reason !== "string") {
    return {
      ok: false,
      error: {
        code: "INVALID_APPROVAL_DECISION_INPUT",
        message: "Approval decision reason must be a string when provided.",
      },
    };
  }

  return {
    ok: true,
    body: {
      reason: typeof body.reason === "string" ? body.reason : undefined,
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

function approvalIdFromPath(path: string): string | null {
  const prefix = "/agents/approvals/";

  if (!path.startsWith(prefix)) {
    return null;
  }

  const id = path.slice(prefix.length).split("/")[0]?.trim();
  return id || null;
}

function approvalDecisionFromPath(path: string): "approved" | "rejected" | null {
  if (path.endsWith("/approve")) {
    return "approved";
  }

  if (path.endsWith("/reject")) {
    return "rejected";
  }

  return null;
}

function isApprovalExecutionPath(path: string): boolean {
  return path.endsWith("/execute");
}

function isApprovalExpirePath(path: string): boolean {
  return path === "/agents/approvals/expire";
}

function approvalResponseDetails(approval: ReturnType<typeof createApprovalRecord>): Record<string, unknown> {
  return {
    id: approval.id,
    status: approval.status,
    createdAt: approval.createdAt,
    expiresAt: approval.expiresAt,
    decidedAt: approval.decidedAt,
    expiredAt: approval.expiredAt,
    route: approval.route,
    advisor: approval.advisor,
    category: approval.category,
    skillId: approval.skillId,
    selectedSkillIds: approval.selectedSkillIds,
    decision: approval.decision,
    executedAt: approval.executedAt,
    executionRequestId: approval.executionRequestId,
    executionMode: approval.executionMode,
  };
}

function approvalErrorMessage(code: string): string {
  if (code === "APPROVAL_NOT_FOUND") {
    return "Approval record was not found.";
  }

  if (code === "APPROVAL_ALREADY_EXECUTED") {
    return "Approval record has already been executed.";
  }

  if (code === "APPROVAL_EXPIRED") {
    return "Approval record has expired and cannot be changed or executed.";
  }

  if (code === "APPROVAL_NOT_APPROVED") {
    return "Approval record must be approved before execution.";
  }

  return "Approval record has already been decided.";
}

function actionPolicyResponse(policy: ActionPolicyResult): { statusCode: number; error: ParsedError } | null {
  if (policy.decision === "deny") {
    return {
      statusCode: 403,
      error: {
        code: "ACTION_POLICY_DENIED",
        message: "Action policy denied this request.",
        details: {
          decision: policy.decision,
          reason: policy.reason,
        },
      },
    };
  }

  return null;
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
  const policy = evaluateActionPolicy({
    route: "/agents/execute",
    message: parsed.body.message,
    advisor: route.advisor,
    category: route.category,
    skillId: route.skills[0]?.id,
    context: parsed.body.context,
  });
  const policyError = actionPolicyResponse(policy);

  if (policyError) {
    sendError(response, policyError.statusCode, policyError.error, requestId, auditContext);
    return;
  }

  if (policy.decision === "requires_approval") {
    const approval = createApprovalRecord({
      requestId,
      method: auditContext.method,
      route: "/agents/execute",
      advisor: route.advisor,
      category: route.category,
      skillId: route.skills[0]?.id,
      selectedSkillIds: route.skills.map((skill) => skill.id),
      policyReason: policy.reason,
      matchedTerms: policy.matchedTerms,
      message: parsed.body.message,
      context: parsed.body.context,
    });

    sendError(
      response,
      409,
      {
        code: "ACTION_REQUIRES_APPROVAL",
        message: "Action requires explicit human approval before execution.",
        details: {
          decision: policy.decision,
          reason: policy.reason,
          approval: approvalResponseDetails(approval),
        },
      },
      requestId,
      auditContext,
    );
    return;
  }

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
    actionPolicyDecision: policy.decision,
  });

  sendJson(response, 200, { requestId, route, execution, actionPolicy: policy }, requestId);
}

async function handleApprovalExecution(
  request: IncomingMessage,
  response: ServerResponse,
  requestId: string,
  approvalId: string,
): Promise<void> {
  const auditContext = {
    method: request.method ?? "UNKNOWN",
    route: "/agents/approvals",
  };

  const result = markApprovalRecordExecuted(approvalId, requestId);

  if (!result.ok) {
    const statusCode = result.code === "APPROVAL_NOT_FOUND" ? 404 : 409;

    if (result.code === "APPROVAL_EXPIRED" && result.approval) {
      safeRecordApiAuditEvent({
        requestId,
        method: auditContext.method,
        route: auditContext.route,
        eventType: "approval.expire",
        status: "success",
        advisor: result.approval.advisor,
        selectedSkillIds: result.approval.selectedSkillIds,
        errorCode: "APPROVAL_EXPIRED",
      });
    }

    sendError(
      response,
      statusCode,
      {
        code: result.code,
        message: approvalErrorMessage(result.code),
        details: result.approval ? { approval: approvalResponseDetails(result.approval) } : {},
      },
      requestId,
      auditContext,
    );
    return;
  }

  safeRecordApiAuditEvent({
    requestId,
    method: auditContext.method,
    route: auditContext.route,
    eventType: "approval.execute",
    status: "success",
    advisor: result.approval.advisor,
    selectedSkillIds: result.approval.selectedSkillIds,
    errorCode: "APPROVAL_EXECUTED_DRY_RUN",
  });

  sendJson(
    response,
    200,
    {
      requestId,
      approval: result.approval,
      execution: {
        status: "completed",
        mode: "dry_run",
        approvalId: result.approval.id,
        skillId: result.approval.skillId ?? result.approval.selectedSkillIds[0] ?? null,
        summary: "Approved action replay recorded in dry-run mode. No external side effects were performed.",
        performedExternalAction: false,
      },
    },
    requestId,
  );
}

async function handleApprovalDecision(
  request: IncomingMessage,
  response: ServerResponse,
  requestId: string,
  approvalId: string,
  decision: "approved" | "rejected",
): Promise<void> {
  const auditContext = {
    method: request.method ?? "UNKNOWN",
    route: "/agents/approvals",
  };
  const rawBody = await readBody(request);
  const parsed = parseApprovalDecisionRequestBody(rawBody);

  if (!parsed.ok) {
    sendError(response, 400, parsed.error, requestId, auditContext);
    return;
  }

  const result = decideApprovalRecord(approvalId, {
    requestId,
    decision,
    reason: parsed.body.reason,
  });

  if (!result.ok) {
    const statusCode = result.code === "APPROVAL_NOT_FOUND" ? 404 : 409;

    if (result.code === "APPROVAL_EXPIRED" && result.approval) {
      safeRecordApiAuditEvent({
        requestId,
        method: auditContext.method,
        route: auditContext.route,
        eventType: "approval.expire",
        status: "success",
        advisor: result.approval.advisor,
        selectedSkillIds: result.approval.selectedSkillIds,
        errorCode: "APPROVAL_EXPIRED",
      });
    }

    sendError(
      response,
      statusCode,
      {
        code: result.code,
        message: approvalErrorMessage(result.code),
        details: result.approval ? { approval: approvalResponseDetails(result.approval) } : {},
      },
      requestId,
      auditContext,
    );
    return;
  }

  safeRecordApiAuditEvent({
    requestId,
    method: auditContext.method,
    route: auditContext.route,
    eventType: "approval.decision",
    status: "success",
    advisor: result.approval.advisor,
    selectedSkillIds: result.approval.selectedSkillIds,
    errorCode: decision === "approved" ? "APPROVAL_APPROVED" : "APPROVAL_REJECTED",
  });

  sendJson(
    response,
    200,
    {
      requestId,
      approval: result.approval,
      decision,
      execution: {
        status: "not_executed",
        reason: "Approval decision recorded. Deferred action execution is not enabled in this baseline.",
      },
    },
    requestId,
  );
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

  const policy = evaluateActionPolicy({
    route: "/agents/skills/execute",
    skillId: parsed.body.skillId,
    context: parsed.body.context,
  });
  const policyError = actionPolicyResponse(policy);

  if (policyError) {
    sendError(response, policyError.statusCode, policyError.error, requestId, auditContext);
    return;
  }

  if (policy.decision === "requires_approval") {
    const approval = createApprovalRecord({
      requestId,
      method: auditContext.method,
      route: "/agents/skills/execute",
      skillId: parsed.body.skillId,
      selectedSkillIds: [parsed.body.skillId],
      policyReason: policy.reason,
      matchedTerms: policy.matchedTerms,
      message: typeof parsed.body.context.message === "string" ? parsed.body.context.message : undefined,
      context: parsed.body.context,
    });

    sendError(
      response,
      409,
      {
        code: "ACTION_REQUIRES_APPROVAL",
        message: "Action requires explicit human approval before execution.",
        details: {
          decision: policy.decision,
          reason: policy.reason,
          approval: approvalResponseDetails(approval),
        },
      },
      requestId,
      auditContext,
    );
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
    actionPolicyDecision: policy.decision,
  });

  sendJson(response, 200, { ...execution, requestId, actionPolicy: policy }, requestId);
}

export const server = createServer(async (request, response) => {
  const requestStartedAt = Date.now();
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
      logRequest(requestId, request.method, request.url, 200, requestStartedAt);
      return;
    }

    if (request.method === "GET" && requestPath === "/ready") {
      sendJson(response, 200, { status: "ready", service: SERVICE_NAME }, requestId);
      logRequest(requestId, request.method, request.url, 200, requestStartedAt);
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
      logRequest(requestId, request.method, request.url, 200, requestStartedAt);
      return;
    }

    if (request.method === "GET" && requestPath === "/agents/audit") {
      const adminAuth = verifyAdminRequest(request);

      if (!adminAuth.ok) {
        sendError(response, adminAuth.statusCode, adminAuth.error, requestId, {
          method: request.method ?? "UNKNOWN",
          route: requestPath,
        });
        logRequest(requestId, request.method, request.url, adminAuth.statusCode, requestStartedAt);
        return;
      }

      sendJson(
        response,
        200,
        {
          events: listApiAuditEvents({ limit: limitFromUrl(request.url) }),
        },
        requestId,
      );
      logRequest(requestId, request.method, request.url, 200, requestStartedAt);
      return;
    }

    if (request.method === "GET" && requestPath === "/agents/dashboard") {
      const adminAuth = verifyAdminRequest(request);

      if (!adminAuth.ok) {
        sendError(response, adminAuth.statusCode, adminAuth.error, requestId, {
          method: request.method ?? "UNKNOWN",
          route: requestPath,
        });
        logRequest(requestId, request.method, request.url, adminAuth.statusCode, requestStartedAt);
        return;
      }

      sendJson(
        response,
        200,
        {
          dashboard: buildAdvisorDashboardSummary({
            limit: limitFromUrl(request.url),
          }),
        },
        requestId,
      );
      logRequest(requestId, request.method, request.url, 200, requestStartedAt);
      return;
    }

    if (request.method === "GET" && requestPath === "/agents/approvals") {
      const adminAuth = verifyAdminRequest(request);

      if (!adminAuth.ok) {
        sendError(response, adminAuth.statusCode, adminAuth.error, requestId, {
          method: request.method ?? "UNKNOWN",
          route: requestPath,
        });
        logRequest(requestId, request.method, request.url, adminAuth.statusCode, requestStartedAt);
        return;
      }

      sendJson(
        response,
        200,
        {
          approvals: listApprovalRecords({ limit: limitFromUrl(request.url) }),
        },
        requestId,
      );
      logRequest(requestId, request.method, request.url, 200, requestStartedAt);
      return;
    }

    if (request.method === "GET" && requestPath === "/agents/approvals/summary") {
      const adminAuth = verifyAdminRequest(request);

      if (!adminAuth.ok) {
        sendError(response, adminAuth.statusCode, adminAuth.error, requestId, {
          method: request.method ?? "UNKNOWN",
          route: "/agents/approvals",
        });
        logRequest(requestId, request.method, request.url, adminAuth.statusCode, requestStartedAt);
        return;
      }

      sendJson(response, 200, { summary: getApprovalSummary() }, requestId);
      logRequest(requestId, request.method, request.url, 200, requestStartedAt);
      return;
    }

    if (request.method === "POST" && isApprovalExpirePath(requestPath)) {
      const adminAuth = verifyAdminRequest(request);

      if (!adminAuth.ok) {
        sendError(response, adminAuth.statusCode, adminAuth.error, requestId, {
          method: request.method ?? "UNKNOWN",
          route: "/agents/approvals",
        });
        logRequest(requestId, request.method, request.url, adminAuth.statusCode, requestStartedAt);
        return;
      }

      const expired = expirePendingApprovalRecords();

      for (const approval of expired) {
        safeRecordApiAuditEvent({
          requestId,
          method: request.method ?? "UNKNOWN",
          route: "/agents/approvals",
          eventType: "approval.expire",
          status: "success",
          advisor: approval.advisor,
          selectedSkillIds: approval.selectedSkillIds,
          errorCode: "APPROVAL_EXPIRED",
        });
      }

      sendJson(
        response,
        200,
        {
          requestId,
          expiredCount: expired.length,
          expiredApprovalIds: expired.map((approval) => approval.id),
          summary: getApprovalSummary(),
        },
        requestId,
      );
      logRequest(requestId, request.method, request.url, 200, requestStartedAt);
      return;
    }

    if (request.method === "POST" && requestPath.startsWith("/agents/approvals/")) {
      const decision = approvalDecisionFromPath(requestPath);
      const approvalId = approvalIdFromPath(requestPath);

      if ((decision || isApprovalExecutionPath(requestPath)) && approvalId) {
        const adminAuth = verifyAdminRequest(request);

        if (!adminAuth.ok) {
          sendError(response, adminAuth.statusCode, adminAuth.error, requestId, {
            method: request.method ?? "UNKNOWN",
            route: "/agents/approvals",
          });
          logRequest(requestId, request.method, request.url, adminAuth.statusCode, requestStartedAt);
          return;
        }

        if (decision) {
          await handleApprovalDecision(request, response, requestId, approvalId, decision);
        } else {
          await handleApprovalExecution(request, response, requestId, approvalId);
        }
        logRequest(requestId, request.method, request.url, response.statusCode, requestStartedAt);
        return;
      }
    }

    if (request.method === "GET" && requestPath.startsWith("/agents/approvals/")) {
      const adminAuth = verifyAdminRequest(request);

      if (!adminAuth.ok) {
        sendError(response, adminAuth.statusCode, adminAuth.error, requestId, {
          method: request.method ?? "UNKNOWN",
          route: "/agents/approvals",
        });
        logRequest(requestId, request.method, request.url, adminAuth.statusCode, requestStartedAt);
        return;
      }

      const approvalId = approvalIdFromPath(requestPath);
      const approval = approvalId ? getApprovalRecord(approvalId) : undefined;

      if (!approval) {
        sendError(
          response,
          404,
          {
            code: "APPROVAL_NOT_FOUND",
            message: "Approval record was not found.",
            details: {},
          },
          requestId,
          {
            method: request.method ?? "UNKNOWN",
            route: "/agents/approvals",
          },
        );
        logRequest(requestId, request.method, request.url, 404, requestStartedAt);
        return;
      }

      sendJson(response, 200, { approval }, requestId);
      logRequest(requestId, request.method, request.url, 200, requestStartedAt);
      return;
    }

    if (request.method === "GET" && requestPath === "/agents/metrics") {
      const adminAuth = verifyAdminRequest(request);

      if (!adminAuth.ok) {
        sendError(response, adminAuth.statusCode, adminAuth.error, requestId, {
          method: request.method ?? "UNKNOWN",
          route: requestPath,
        });
        logRequest(requestId, request.method, request.url, adminAuth.statusCode, requestStartedAt);
        return;
      }

      sendJson(
        response,
        200,
        {
          metrics: getApiMetricsSnapshot(),
        },
        requestId,
      );
      logRequest(requestId, request.method, request.url, 200, requestStartedAt);
      return;
    }

    if (request.method === "POST" && requestPath === "/agents/route") {
      await handleAgentsRoute(request, response, requestId);
      logRequest(requestId, request.method, request.url, response.statusCode, requestStartedAt);
      return;
    }

    if (request.method === "POST" && requestPath === "/agents/execute") {
      await handleAgentsExecute(request, response, requestId);
      logRequest(requestId, request.method, request.url, response.statusCode, requestStartedAt);
      return;
    }

    if (request.method === "POST" && requestPath === "/agents/skills/execute") {
      await handleAgentsSkillExecute(request, response, requestId);
      logRequest(requestId, request.method, request.url, response.statusCode, requestStartedAt);
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
      "/agents/metrics",
      "/agents/approvals",
    ]);

    if (knownPaths.has(requestPath) || requestPath.startsWith("/agents/approvals/")) {
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
      logRequest(requestId, request.method, request.url, 405, requestStartedAt);
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
    logRequest(requestId, request.method, request.url, 404, requestStartedAt);
  } catch (error) {
    if (error instanceof HttpRequestError) {
      sendError(response, error.statusCode, error.apiError, requestId, {
        method: request.method ?? "UNKNOWN",
        route: requestPath,
      });
      logRequest(requestId, request.method, request.url, error.statusCode, requestStartedAt);
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
    logRequest(requestId, request.method, request.url, 500, requestStartedAt);
  }
});

const isMainModule = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isMainModule) {
  let shutdownStarted = false;

  function shutdown(signal: NodeJS.Signals): void {
    if (shutdownStarted) {
      return;
    }

    shutdownStarted = true;
    console.log(`Received ${signal}. Shutting down API server.`);

    const forceExitTimer = setTimeout(() => {
      console.error("Forced shutdown after graceful shutdown timeout.");
      process.exit(1);
    }, 5_000);
    forceExitTimer.unref();

    server.close((error) => {
      clearTimeout(forceExitTimer);

      if (error) {
        console.error("API server shutdown failed.");
        console.error(error);
        process.exit(1);
      }

      shutdownOtelExport()
        .then(() => {
          console.log("API server shutdown complete.");
          process.exit(0);
        })
        .catch((shutdownError: unknown) => {
          console.error("OpenTelemetry shutdown failed.");
          console.error(shutdownError);
          process.exit(1);
        });
    });
  }

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  try {
    initializeOtelExportIfEnabled();
  } catch (error) {
    console.warn("OpenTelemetry trace export initialization failed. Continuing without external export.");
    console.warn(error instanceof Error ? error.message : "Unknown OpenTelemetry initialization error.");
  }

  server.listen(PORT, () => {
    const address = server.address();
    const boundPort =
      typeof address === "object" && address !== null
        ? (address as AddressInfo).port
        : PORT;

    console.log(`API server listening on http://localhost:${boundPort}`);
  });
}
