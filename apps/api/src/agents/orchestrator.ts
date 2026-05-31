import { SkillDefinition, getSkillsForAdvisor } from "./skills.js";
import { ExecutionPlan, buildExecutionPlan } from "./planner.js";
import { AdvisorActionPlan, AdvisorPlan, buildActionPlan, createPlanForRoute } from "./plans.js";

export type AgentRequest = {
  prompt: string;
  tenantId: string;
  estateId?: string;
  actorUserId: string;
  actorRole: string;
};

export type Confidence = "low" | "medium" | "high";

export type AgentResponse = {
  advisor: string;
  category: string;
  confidence: Confidence;
  matchedKeywords: string[];
  reason: string;
  nextAction: string;
  skills: SkillDefinition[];
  executionPlan: ExecutionPlan;
  plan: AdvisorPlan;
  actionPlan: AdvisorActionPlan;
};

type RouteDefinition = {
  advisor: string;
  category: string;
  keywords: string[];
  nextAction: string;
};

const ROUTES: RouteDefinition[] = [
  {
    advisor: "Estate Advisor",
    category: "property/staff/maintenance",
    keywords: ["property", "estate", "staff", "maintenance", "repair", "inspection", "house"],
    nextAction: "Route to estate operations review.",
  },
  {
    advisor: "Security Advisor",
    category: "passwords/access/security",
    keywords: [
      "password",
      "passwords",
      "access",
      "gate",
      "wifi",
      "wi-fi",
      "security",
      "alarm",
      "camera",
      "lock",
    ],
    nextAction: "Route to security review before action.",
  },
  {
    advisor: "Vendor Advisor",
    category: "contractors/vendors",
    keywords: [
      "contractor",
      "contractors",
      "vendor",
      "vendors",
      "hvac",
      "plumber",
      "electrician",
      "landscaper",
    ],
    nextAction: "Route to vendor operations review.",
  },
  {
    advisor: "Concierge Advisor",
    category: "lifestyle/logistics",
    keywords: [
      "lifestyle",
      "logistics",
      "chef",
      "driver",
      "travel",
      "reservation",
      "booking",
      "money",
      "payment",
      "event",
      "concierge",
    ],
    nextAction: "Route to concierge coordination.",
  },
  {
    advisor: "Compliance Advisor",
    category: "contracts/risk/legal/privacy",
    keywords: [
      "contract",
      "contracts",
      "risk",
      "legal",
      "privacy",
      "compliance",
      "liability",
      "insurance",
    ],
    nextAction: "Route to compliance review.",
  },
];

function matchedKeywords(prompt: string, keywords: string[]): string[] {
  return keywords.filter((keyword) => prompt.includes(keyword));
}

function confidenceForMatches(matches: string[]): Confidence {
  if (matches.length >= 2) {
    return "high";
  }

  if (matches.length === 1) {
    return "medium";
  }

  return "low";
}

function orderedSkillsForRoute(advisor: string, matches: string[]): SkillDefinition[] {
  const skills = getSkillsForAdvisor(advisor);

  if (advisor !== "Estate Advisor" || !matches.includes("maintenance")) {
    return skills;
  }

  return [...skills].sort((left, right) => {
    if (left.id === "maintenance_triage") {
      return -1;
    }

    if (right.id === "maintenance_triage") {
      return 1;
    }

    return 0;
  });
}

export function orchestrateAgentRequest(request: AgentRequest): AgentResponse {
  const prompt = request.prompt.toLowerCase();

  for (const route of ROUTES) {
    const matches = matchedKeywords(prompt, route.keywords);

    if (matches.length > 0) {
      const routeResult = {
        advisor: route.advisor,
        category: route.category,
        confidence: confidenceForMatches(matches),
        matchedKeywords: matches,
        reason: `Matched ${route.category} keyword(s): ${matches.join(", ")}.`,
        nextAction: route.nextAction,
        skills: orderedSkillsForRoute(route.advisor, matches),
      };

      return {
        ...routeResult,
        executionPlan: buildExecutionPlan(routeResult),
        plan: createPlanForRoute(routeResult, request.prompt),
        actionPlan: buildActionPlan(routeResult),
      };
    }
  }

  const fallbackResult = {
    advisor: "Operations Advisor",
    category: "unknown/unclear",
    confidence: "low" as Confidence,
    matchedKeywords: [],
    reason: "No known routing keywords matched the request.",
    nextAction: "Ask a clarifying question before taking action.",
    skills: getSkillsForAdvisor("Operations Advisor"),
  };

  return {
    ...fallbackResult,
    executionPlan: buildExecutionPlan(fallbackResult),
    plan: createPlanForRoute(fallbackResult, request.prompt),
    actionPlan: buildActionPlan(fallbackResult),
  };
}
