import { ApiAuditEvent, listApiAuditEvents } from "./audit-trail.js";
import { ADVISOR_SKILLS, RiskLevel } from "./skills.js";

export type AdvisorDashboardAdvisor = {
  id: string;
  name: string;
  description: string;
  skillCount: number;
  riskLevel: RiskLevel;
  requiresHumanApproval: boolean;
};

export type AdvisorDashboardAuditStats = {
  totalEvents: number;
  successCount: number;
  errorCount: number;
  advisorRouteCount: number;
  advisorExecuteCount: number;
  skillExecuteCount: number;
  approvalDecisionCount: number;
  approvalExecuteCount: number;
  apiErrorCount: number;
};

export type AdvisorDashboardSummary = {
  status: "ok";
  generatedAt: string;
  advisors: AdvisorDashboardAdvisor[];
  audit: {
    recentEvents: ApiAuditEvent[];
    stats: AdvisorDashboardAuditStats;
  };
};

type AdvisorDashboardSummaryOptions = {
  limit?: number;
};

const DASHBOARD_RECENT_EVENTS_DEFAULT_LIMIT = 10;
const DASHBOARD_RECENT_EVENTS_MAX_LIMIT = 25;

const ADVISOR_DESCRIPTIONS: Record<string, string> = {
  "Estate Advisor": "Property, staff, and maintenance readiness.",
  "Security Advisor": "Access, password, vault, and security triage.",
  "Vendor Advisor": "Contractor, vendor, and quote review.",
  "Concierge Advisor": "Lifestyle, itinerary, and logistics planning.",
  "Compliance Advisor": "Contract, privacy, legal, and approval risk review.",
  "Operations Advisor": "Fallback clarification and workflow routing.",
};

const RISK_RANK: Record<RiskLevel, number> = {
  Low: 1,
  Medium: 2,
  High: 3,
  Critical: 4,
};

function advisorId(advisor: string): string {
  return advisor
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeRecentEventsLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return DASHBOARD_RECENT_EVENTS_DEFAULT_LIMIT;
  }

  return Math.max(0, Math.min(Math.trunc(limit), DASHBOARD_RECENT_EVENTS_MAX_LIMIT));
}

function highestRiskLevel(risks: RiskLevel[]): RiskLevel {
  return risks.reduce<RiskLevel>((highest, current) => {
    return RISK_RANK[current] > RISK_RANK[highest] ? current : highest;
  }, "Low");
}

function buildAdvisorCards(): AdvisorDashboardAdvisor[] {
  const advisorNames = [...new Set(ADVISOR_SKILLS.map((skill) => skill.advisor))];

  return advisorNames.map((advisor) => {
    const skills = ADVISOR_SKILLS.filter((skill) => skill.advisor === advisor);
    const riskLevel = highestRiskLevel(skills.map((skill) => skill.riskLevel));

    return {
      id: advisorId(advisor),
      name: advisor,
      description: ADVISOR_DESCRIPTIONS[advisor] ?? "Advisor workflow support.",
      skillCount: skills.length,
      riskLevel,
      requiresHumanApproval: RISK_RANK[riskLevel] >= RISK_RANK.Medium,
    };
  });
}

function buildAuditStats(events: ApiAuditEvent[]): AdvisorDashboardAuditStats {
  return {
    totalEvents: events.length,
    successCount: events.filter((event) => event.status === "success").length,
    errorCount: events.filter((event) => event.status === "error").length,
    advisorRouteCount: events.filter((event) => event.eventType === "advisor.route").length,
    advisorExecuteCount: events.filter((event) => event.eventType === "advisor.execute").length,
    skillExecuteCount: events.filter((event) => event.eventType === "skill.execute").length,
    approvalDecisionCount: events.filter((event) => event.eventType === "approval.decision").length,
    approvalExecuteCount: events.filter((event) => event.eventType === "approval.execute").length,
    apiErrorCount: events.filter((event) => event.eventType === "api.error").length,
  };
}

export function buildAdvisorDashboardSummary(
  options: AdvisorDashboardSummaryOptions = {},
): AdvisorDashboardSummary {
  const retainedEvents = listApiAuditEvents({ limit: 100 });
  const recentEvents = listApiAuditEvents({
    limit: normalizeRecentEventsLimit(options.limit),
  });

  return {
    status: "ok",
    generatedAt: new Date().toISOString(),
    advisors: buildAdvisorCards(),
    audit: {
      recentEvents,
      stats: buildAuditStats(retainedEvents),
    },
  };
}
