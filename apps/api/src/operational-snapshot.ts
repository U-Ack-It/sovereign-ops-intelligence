import { listApiAuditEvents, type ApiAuditEvent } from "./agents/audit-trail.js";
import { buildAdvisorDashboardSummary, type AdvisorDashboardAdvisor, type AdvisorDashboardAuditStats } from "./agents/dashboard.js";
import { getApprovalSummary, listApprovalRecords, type ApprovalRecord, type ApprovalSummary } from "./approvals.js";
import { getApiMetricsSnapshot } from "./observability.js";

export type OperationalSnapshotMetrics = {
  generatedAt: string;
  process: {
    uptimeSeconds: number;
    nodeVersion: string;
    pid: number;
    environment: string;
  };
  http: {
    totalRequests: number;
    successResponses: number;
    errorResponses: number;
    statusCodeCounts: Record<string, number>;
    routeCounts: Record<string, number>;
    methodCounts: Record<string, number>;
  };
  audit: {
    totalRetainedEvents: number;
    successCount: number;
    errorCount: number;
    advisorRouteCount: number;
    advisorExecuteCount: number;
    skillExecuteCount: number;
    approvalDecisionCount: number;
    approvalExecuteCount: number;
    approvalExpireCount: number;
    apiErrorCount: number;
  };
  export: {
    otelEnabled: boolean;
    serviceName: string;
    endpointConfigured: boolean;
  };
};

export type OperationalSnapshot = {
  status: "ok";
  generatedAt: string;
  retention: {
    mode: "in_memory";
    maxAuditEvents: number;
    maxApprovalRecords: number;
    rawInputsStored: false;
  };
  advisors: AdvisorDashboardAdvisor[];
  audit: {
    stats: AdvisorDashboardAuditStats;
    recentEvents: ApiAuditEvent[];
  };
  approvals: {
    summary: ApprovalSummary;
    recentRecords: ApprovalRecord[];
  };
  metrics: OperationalSnapshotMetrics;
};

type OperationalSnapshotOptions = {
  limit?: number;
};

const DEFAULT_SNAPSHOT_LIMIT = 10;
const MAX_SNAPSHOT_LIMIT = 25;

function normalizeSnapshotLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return DEFAULT_SNAPSHOT_LIMIT;
  }

  return Math.max(0, Math.min(Math.trunc(limit), MAX_SNAPSHOT_LIMIT));
}

function buildSnapshotMetrics(): OperationalSnapshotMetrics {
  const metrics = getApiMetricsSnapshot();

  return {
    generatedAt: metrics.generatedAt,
    process: metrics.process,
    http: metrics.http,
    audit: metrics.audit,
    export: metrics.export,
  };
}

export function buildOperationalSnapshot(options: OperationalSnapshotOptions = {}): OperationalSnapshot {
  const limit = normalizeSnapshotLimit(options.limit);
  const dashboard = buildAdvisorDashboardSummary({ limit });

  return {
    status: "ok",
    generatedAt: new Date().toISOString(),
    retention: {
      mode: "in_memory",
      maxAuditEvents: 100,
      maxApprovalRecords: 100,
      rawInputsStored: false,
    },
    advisors: dashboard.advisors,
    audit: {
      stats: dashboard.audit.stats,
      recentEvents: listApiAuditEvents({ limit }),
    },
    approvals: {
      summary: getApprovalSummary(),
      recentRecords: listApprovalRecords({ limit }),
    },
    metrics: buildSnapshotMetrics(),
  };
}
