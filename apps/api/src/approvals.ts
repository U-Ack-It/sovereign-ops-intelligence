import { createHash } from "node:crypto";

export type ApprovalStatus = "pending";

export type ApprovalRecord = {
  id: string;
  requestId: string;
  createdAt: string;
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
};

type ListApprovalRecordsOptions = {
  limit?: number;
};

const MAX_RETAINED_APPROVALS = 100;
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

export function createApprovalRecord(input: CreateApprovalRecordInput): ApprovalRecord {
  const message = normalizedText(input.message);
  const record: ApprovalRecord = {
    id: `approval_${nextApprovalId++}`,
    requestId: input.requestId,
    createdAt: new Date().toISOString(),
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

  return { ...record, selectedSkillIds: [...record.selectedSkillIds], matchedTerms: [...record.matchedTerms], contextKeys: [...record.contextKeys] };
}

export function listApprovalRecords(options: ListApprovalRecordsOptions = {}): ApprovalRecord[] {
  return approvals.slice(0, normalizedLimit(options.limit)).map((record) => ({
    ...record,
    selectedSkillIds: [...record.selectedSkillIds],
    matchedTerms: [...record.matchedTerms],
    contextKeys: [...record.contextKeys],
  }));
}

export function getApprovalRecord(id: string): ApprovalRecord | undefined {
  const record = approvals.find((item) => item.id === id);

  if (!record) {
    return undefined;
  }

  return {
    ...record,
    selectedSkillIds: [...record.selectedSkillIds],
    matchedTerms: [...record.matchedTerms],
    contextKeys: [...record.contextKeys],
  };
}

export function clearApprovalRecords(): void {
  approvals.length = 0;
  nextApprovalId = 1;
}
