import { createHash } from "node:crypto";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "executed" | "expired";
export type ApprovalDecision = "approved" | "rejected";

export type ApprovalRecord = {
  id: string;
  requestId: string;
  createdAt: string;
  expiresAt: string;
  status: ApprovalStatus;
  method: string;
  route: "/agents/execute" | "/agents/skills/execute";
  advisor?: string;
  category?: string;
  skillId?: string;
  selectedSkillIds: string[];
  policyDecision: "requires_approval";
  policyReason: string;
  matchedTerms: string[];
  inputLength: number;
  inputDigest: string;
  contextKeys: string[];
  contextDigest: string;
  decidedAt?: string;
  decisionRequestId?: string;
  decision?: ApprovalDecision;
  decisionReasonLength?: number;
  decisionReasonDigest?: string;
  executedAt?: string;
  executionRequestId?: string;
  executionMode?: "dry_run";
  expiredAt?: string;
};

type CreateApprovalRecordInput = {
  requestId: string;
  method: string;
  route: ApprovalRecord["route"];
  advisor?: string;
  category?: string;
  skillId?: string;
  selectedSkillIds?: string[];
  policyReason: string;
  matchedTerms?: string[];
  message?: string;
  context?: Record<string, unknown>;
  expiresAt?: string;
};

type DecideApprovalRecordInput = {
  requestId: string;
  decision: ApprovalDecision;
  reason?: string;
};

type ApprovalDecisionResult =
  | { ok: true; approval: ApprovalRecord }
  | { ok: false; code: "APPROVAL_NOT_FOUND" | "APPROVAL_ALREADY_DECIDED" | "APPROVAL_EXPIRED"; approval?: ApprovalRecord };

type ApprovalExecutionResult =
  | { ok: true; approval: ApprovalRecord }
  | {
      ok: false;
      code:
        | "APPROVAL_NOT_FOUND"
        | "APPROVAL_NOT_APPROVED"
        | "APPROVAL_ALREADY_EXECUTED"
        | "APPROVAL_EXPIRED";
      approval?: ApprovalRecord;
    };

type ListApprovalRecordsOptions = {
  limit?: number;
};

export type ApprovalSummary = {
  totalRetained: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  executedCount: number;
  expiredCount: number;
  oldestCreatedAt: string | null;
  newestCreatedAt: string | null;
};

const MAX_RETAINED_APPROVALS = 100;
const DEFAULT_APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;
const SENSITIVE_KEY_PATTERN = /authorization|secret|token|password|private|key|otel|header/i;

let nextApprovalId = 1;
const approvals: ApprovalRecord[] = [];

function digestText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedText(value: string | undefined): string {
  return typeof value === "string" ? value : "";
}

function safeContextKeys(context: Record<string, unknown> | undefined): string[] {
  if (!context) {
    return [];
  }

  return Object.keys(context)
    .filter((key) => !SENSITIVE_KEY_PATTERN.test(key))
    .sort();
}

function contextShapeDigest(context: Record<string, unknown> | undefined): string {
  if (!context) {
    return digestText("");
  }

  const shape = safeContextKeys(context).map((key) => {
    const value = context[key];
    const valueType = Array.isArray(value) ? "array" : typeof value;
    return [key, valueType];
  });

  return digestText(JSON.stringify(shape));
}

function normalizedLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return 25;
  }

  return Math.max(0, Math.min(Math.trunc(limit), MAX_RETAINED_APPROVALS));
}

function cloneApprovalRecord(record: ApprovalRecord): ApprovalRecord {
  return {
    ...record,
    selectedSkillIds: [...record.selectedSkillIds],
    matchedTerms: [...record.matchedTerms],
    contextKeys: [...record.contextKeys],
  };
}

function approvalById(id: string): ApprovalRecord | undefined {
  return approvals.find((item) => item.id === id);
}

function defaultExpiresAt(): string {
  return new Date(Date.now() + DEFAULT_APPROVAL_TTL_MS).toISOString();
}

function isExpired(record: ApprovalRecord, nowMs: number): boolean {
  return record.status === "pending" && Date.parse(record.expiresAt) <= nowMs;
}

export function expirePendingApprovalRecords(nowMs: number = Date.now()): ApprovalRecord[] {
  const expired: ApprovalRecord[] = [];
  const expiredAt = new Date(nowMs).toISOString();

  for (const record of approvals) {
    if (isExpired(record, nowMs)) {
      record.status = "expired";
      record.expiredAt = expiredAt;
      expired.push(cloneApprovalRecord(record));
    }
  }

  return expired;
}

export function createApprovalRecord(input: CreateApprovalRecordInput): ApprovalRecord {
  const message = normalizedText(input.message);
  const record: ApprovalRecord = {
    id: `approval_${nextApprovalId++}`,
    requestId: input.requestId,
    createdAt: new Date().toISOString(),
    expiresAt: input.expiresAt ?? defaultExpiresAt(),
    status: "pending",
    method: input.method,
    route: input.route,
    advisor: input.advisor,
    category: input.category,
    skillId: input.skillId,
    selectedSkillIds: input.selectedSkillIds ?? [],
    policyDecision: "requires_approval",
    policyReason: input.policyReason,
    matchedTerms: input.matchedTerms ?? [],
    inputLength: message.length,
    inputDigest: digestText(message),
    contextKeys: safeContextKeys(input.context),
    contextDigest: contextShapeDigest(input.context),
  };

  approvals.unshift(record);

  if (approvals.length > MAX_RETAINED_APPROVALS) {
    approvals.length = MAX_RETAINED_APPROVALS;
  }

  return cloneApprovalRecord(record);
}

export function decideApprovalRecord(id: string, input: DecideApprovalRecordInput): ApprovalDecisionResult {
  expirePendingApprovalRecords();
  const record = approvalById(id);

  if (!record) {
    return { ok: false, code: "APPROVAL_NOT_FOUND" };
  }

  if (record.status === "expired") {
    return { ok: false, code: "APPROVAL_EXPIRED", approval: cloneApprovalRecord(record) };
  }

  if (record.status !== "pending") {
    return { ok: false, code: "APPROVAL_ALREADY_DECIDED", approval: cloneApprovalRecord(record) };
  }

  const reason = normalizedText(input.reason);
  record.status = input.decision;
  record.decision = input.decision;
  record.decidedAt = new Date().toISOString();
  record.decisionRequestId = input.requestId;
  record.decisionReasonLength = reason.length;
  record.decisionReasonDigest = digestText(reason);

  return { ok: true, approval: cloneApprovalRecord(record) };
}

export function markApprovalRecordExecuted(id: string, requestId: string): ApprovalExecutionResult {
  expirePendingApprovalRecords();
  const record = approvalById(id);

  if (!record) {
    return { ok: false, code: "APPROVAL_NOT_FOUND" };
  }

  if (record.status === "executed") {
    return { ok: false, code: "APPROVAL_ALREADY_EXECUTED", approval: cloneApprovalRecord(record) };
  }

  if (record.status === "expired") {
    return { ok: false, code: "APPROVAL_EXPIRED", approval: cloneApprovalRecord(record) };
  }

  if (record.status !== "approved") {
    return { ok: false, code: "APPROVAL_NOT_APPROVED", approval: cloneApprovalRecord(record) };
  }

  record.status = "executed";
  record.executedAt = new Date().toISOString();
  record.executionRequestId = requestId;
  record.executionMode = "dry_run";

  return { ok: true, approval: cloneApprovalRecord(record) };
}

export function listApprovalRecords(options: ListApprovalRecordsOptions = {}): ApprovalRecord[] {
  expirePendingApprovalRecords();
  return approvals.slice(0, normalizedLimit(options.limit)).map(cloneApprovalRecord);
}

export function getApprovalSummary(): ApprovalSummary {
  expirePendingApprovalRecords();
  const createdAtValues = approvals
    .map((record) => record.createdAt)
    .filter((value) => typeof value === "string" && value.trim())
    .sort();

  return {
    totalRetained: approvals.length,
    pendingCount: approvals.filter((record) => record.status === "pending").length,
    approvedCount: approvals.filter((record) => record.status === "approved").length,
    rejectedCount: approvals.filter((record) => record.status === "rejected").length,
    executedCount: approvals.filter((record) => record.status === "executed").length,
    expiredCount: approvals.filter((record) => record.status === "expired").length,
    oldestCreatedAt: createdAtValues[0] ?? null,
    newestCreatedAt: createdAtValues[createdAtValues.length - 1] ?? null,
  };
}

export function getApprovalRecord(id: string): ApprovalRecord | undefined {
  expirePendingApprovalRecords();
  const record = approvalById(id);

  if (!record) {
    return undefined;
  }

  return cloneApprovalRecord(record);
}

export function clearApprovalRecords(): void {
  approvals.length = 0;
  nextApprovalId = 1;
}
