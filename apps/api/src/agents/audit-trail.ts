export type ApiAuditEventType =
  | "advisor.route"
  | "advisor.execute"
  | "skill.execute"
  | "api.error";

export type ApiAuditStatus = "success" | "error";

export type ApiAuditEvent = {
  id: string;
  requestId: string;
  timestamp: string;
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
};

type ApiAuditEventInput = {
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
};

type ListApiAuditEventsOptions = {
  limit?: number;
};

const MAX_RETAINED_EVENTS = 100;
const MAX_INPUT_SUMMARY_CHARS = 160;

let nextEventId = 1;
const events: ApiAuditEvent[] = [];

function sanitizeInputSummary(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const compact = value.replace(/\s+/g, " ").trim();

  if (!compact) {
    return undefined;
  }

  return compact.length > MAX_INPUT_SUMMARY_CHARS
    ? compact.slice(0, MAX_INPUT_SUMMARY_CHARS)
    : compact;
}

function normalizedLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return 25;
  }

  return Math.max(0, Math.min(Math.trunc(limit), MAX_RETAINED_EVENTS));
}

export function recordApiAuditEvent(input: ApiAuditEventInput): ApiAuditEvent {
  const event: ApiAuditEvent = {
    id: `audit_${nextEventId++}`,
    requestId: input.requestId,
    timestamp: new Date().toISOString(),
    method: input.method,
    route: input.route,
    eventType: input.eventType,
    status: input.status,
    advisor: input.advisor,
    inputSummary: sanitizeInputSummary(input.inputSummary),
    selectedSkillIds: input.selectedSkillIds,
    planStepCount: input.planStepCount,
    actionPlanStepCount: input.actionPlanStepCount,
    errorCode: input.errorCode,
  };

  events.unshift(event);

  if (events.length > MAX_RETAINED_EVENTS) {
    events.length = MAX_RETAINED_EVENTS;
  }

  return event;
}

export function listApiAuditEvents(options: ListApiAuditEventsOptions = {}): ApiAuditEvent[] {
  return events.slice(0, normalizedLimit(options.limit));
}

export function clearApiAuditEvents(): void {
  events.length = 0;
  nextEventId = 1;
}
