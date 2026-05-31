import type { SkillDefinition } from "./skills.js";

export type AdvisorName =
  | "Estate Advisor"
  | "Security Advisor"
  | "Vendor Advisor"
  | "Concierge Advisor"
  | "Compliance Advisor"
  | "Operations Advisor"
  | string;

export type PlanPriority = "low" | "medium" | "high";

export type AdvisorPlanStep = {
  id: string;
  advisor: AdvisorName;
  skillId: string;
  title: string;
  description: string;
  action: string;
  priority: PlanPriority;
  requiresHumanApproval: boolean;
  expectedOutput: string;
};

export type AdvisorPlan = {
  advisor: AdvisorName;
  category: string;
  confidence: "low" | "medium" | "high";
  summary: string;
  steps: AdvisorPlanStep[];
  safeguards: string[];
  missingInputs: string[];
};

export type PlanStep = {
  id: string;
  skillId: string;
  title: string;
  objective: string;
  requiredInputs: string[];
  expectedOutput: string;
  requiresApproval: boolean;
};

export type AdvisorActionPlan = {
  advisor: AdvisorName;
  category: string;
  summary: string;
  steps: PlanStep[];
  escalation: string | null;
};

export type ActionPlanRouteInput = {
  advisor: AdvisorName;
  category: string;
  matchedKeywords: string[];
  skills: SkillDefinition[];
};

export type AdvisorPlanRouteInput = ActionPlanRouteInput & {
  confidence: "low" | "medium" | "high";
};

function skillById(skills: SkillDefinition[], skillId: string): SkillDefinition {
  const exact = skills.find((skill) => skill.id === skillId);

  if (exact) {
    return exact;
  }

  const fallback = skills[0];

  if (!fallback) {
    throw new Error("Cannot build an action plan without skills.");
  }

  return fallback;
}

function step(
  id: string,
  skill: SkillDefinition,
  title: string,
  objective: string,
  requiredInputs: string[],
  expectedOutput: string,
  requiresApproval: boolean,
): PlanStep {
  return {
    id,
    skillId: skill.id,
    title,
    objective,
    requiredInputs,
    expectedOutput,
    requiresApproval,
  };
}

function urgentEstateEscalation(routeResult: ActionPlanRouteInput): string | null {
  const urgentKeywords = ["urgent", "safety", "damage", "leak", "flood", "fire"];

  if (routeResult.matchedKeywords.some((keyword) => urgentKeywords.includes(keyword))) {
    return "Escalate to estate manager for urgent safety or property damage review.";
  }

  return null;
}

function containsAny(text: string, keywords: string[]): boolean {
  const normalized = text.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword));
}

function selectSkill(skills: SkillDefinition[], preferredIds: string[], fallbackIndex = 0): SkillDefinition {
  const preferred = preferredIds
    .map((skillId) => skills.find((skill) => skill.id === skillId))
    .find((skill): skill is SkillDefinition => Boolean(skill));

  if (preferred) {
    return preferred;
  }

  const fallback = skills[fallbackIndex] ?? skills[0];

  if (!fallback) {
    throw new Error("Cannot build an advisor plan without skills.");
  }

  return fallback;
}

function advisorPlanStep(
  id: string,
  advisor: AdvisorName,
  skill: SkillDefinition,
  title: string,
  description: string,
  priority: PlanPriority,
  requiresHumanApproval: boolean,
  expectedOutput: string,
): AdvisorPlanStep {
  return {
    id,
    advisor,
    skillId: skill.id,
    title,
    description,
    action: description,
    priority,
    requiresHumanApproval,
    expectedOutput,
  };
}

function missingInputsFor(advisor: AdvisorName, message: string): string[] {
  const missingInputs: string[] = [];

  if (!message.trim()) {
    missingInputs.push("message");
  }

  if (advisor === "Estate Advisor" && !containsAny(message, ["property", "estate", "house"])) {
    missingInputs.push("propertyName");
  }

  if (advisor === "Vendor Advisor" && !containsAny(message, ["vendor", "contractor", "hvac", "plumber", "electrician", "landscaper"])) {
    missingInputs.push("vendorType");
  }

  if (advisor === "Compliance Advisor" && !containsAny(message, ["contract", "privacy", "legal", "policy"])) {
    missingInputs.push("contractType");
  }

  if (advisor === "Operations Advisor") {
    missingInputs.push("objective", "priority", "owner", "deadline");
  }

  return missingInputs;
}

function safeguardsFor(advisor: AdvisorName): string[] {
  if (advisor === "Estate Advisor") {
    return ["Protect property access.", "Document maintenance decisions."];
  }

  if (advisor === "Security Advisor") {
    return ["Never expose passwords or secrets.", "Require approval before credential changes."];
  }

  if (advisor === "Vendor Advisor") {
    return ["Verify vendor identity, insurance, scope, and pricing before engagement."];
  }

  if (advisor === "Concierge Advisor") {
    return ["Confirm guest/client preferences and timing before execution."];
  }

  if (advisor === "Compliance Advisor") {
    return ["Flag legal/privacy review before binding decisions."];
  }

  return ["Clarify objective, priority, owner, and deadline."];
}

export function createPlanForRoute(
  routeResult: AdvisorPlanRouteInput,
  originalMessage = "",
): AdvisorPlan {
  const advisor = routeResult.advisor;
  const skills = routeResult.skills;
  const message = originalMessage.toLowerCase();

  if (advisor === "Estate Advisor") {
    const maintenance = selectSkill(skills, ["maintenance_triage"]);
    const health = selectSkill(skills, ["property_health_check"], 1);
    const staff = selectSkill(skills, ["staff_task_brief"], 2);
    const sensitive = containsAny(message, ["staff", "vendor", "access", "money", "payment", "privacy", "legal"]);

    return {
      advisor,
      category: routeResult.category,
      confidence: routeResult.confidence,
      summary: "Build an estate operations plan for property condition, maintenance priority, and staff coordination.",
      steps: [
        advisorPlanStep(
          "estate_plan_1",
          advisor,
          health,
          "Check property health",
          "Review known property context and identify affected systems or open issues.",
          "medium",
          false,
          "Property issue summary",
        ),
        advisorPlanStep(
          "estate_plan_2",
          advisor,
          maintenance,
          "Triage maintenance need",
          "Classify severity, document impact, and decide whether vendor dispatch should be prepared.",
          containsAny(message, ["urgent", "critical", "leak", "damage"]) ? "high" : "medium",
          sensitive,
          "Maintenance triage plan",
        ),
        advisorPlanStep(
          "estate_plan_3",
          advisor,
          staff,
          "Prepare staff brief",
          "Draft clear internal instructions with owner, deadline, and completion criteria.",
          "medium",
          true,
          "Staff task brief",
        ),
      ].slice(0, 5),
      safeguards: safeguardsFor(advisor),
      missingInputs: missingInputsFor(advisor, originalMessage),
    };
  }

  if (advisor === "Security Advisor") {
    const access = selectSkill(skills, ["access_review"]);
    const password = selectSkill(skills, ["password_vault_guidance"], 1);
    const incident = selectSkill(skills, ["incident_triage"], 2);

    return {
      advisor,
      category: routeResult.category,
      confidence: routeResult.confidence,
      summary: "Build a security-safe review plan before any access, password, vault, or incident action.",
      steps: [
        advisorPlanStep(
          "security_plan_1",
          advisor,
          access,
          "Verify access request",
          "Confirm requestor, role, scope, property, reason, and expiration.",
          "high",
          true,
          "Access review checklist",
        ),
        advisorPlanStep(
          "security_plan_2",
          advisor,
          password,
          "Protect credentials",
          "Prepare password, MFA, and vault hygiene reminders without exposing secrets.",
          "high",
          true,
          "Credential safety checklist",
        ),
        advisorPlanStep(
          "security_plan_3",
          advisor,
          incident,
          "Triage security risk",
          "Classify the security issue and define escalation requirements.",
          "high",
          true,
          "Security triage summary",
        ),
      ].slice(0, 5),
      safeguards: safeguardsFor(advisor),
      missingInputs: missingInputsFor(advisor, originalMessage),
    };
  }

  if (advisor === "Vendor Advisor") {
    const scorecard = selectSkill(skills, ["vendor_scorecard"]);
    const scope = selectSkill(skills, ["contractor_scope_builder"], 1);
    const quotes = selectSkill(skills, ["quote_comparison"], 2);

    return {
      advisor,
      category: routeResult.category,
      confidence: routeResult.confidence,
      summary: "Build a vendor review plan covering scope, due diligence, and quote comparison.",
      steps: [
        advisorPlanStep(
          "vendor_plan_1",
          advisor,
          scope,
          "Clarify vendor scope",
          "Define work needed, property constraints, timeline, and acceptance criteria.",
          "medium",
          true,
          "Contractor scope checklist",
        ),
        advisorPlanStep(
          "vendor_plan_2",
          advisor,
          scorecard,
          "Vet vendor fit",
          "Review vendor identity, insurance, license status, service area, and references.",
          "medium",
          true,
          "Vendor scorecard",
        ),
        advisorPlanStep(
          "vendor_plan_3",
          advisor,
          quotes,
          "Compare pricing",
          "Compare quotes by price, exclusions, availability, and operational risk.",
          "medium",
          true,
          "Quote comparison summary",
        ),
      ].slice(0, 5),
      safeguards: safeguardsFor(advisor),
      missingInputs: missingInputsFor(advisor, originalMessage),
    };
  }

  if (advisor === "Concierge Advisor") {
    const planner = selectSkill(skills, ["lifestyle_request_planner"]);
    const itinerary = selectSkill(skills, ["itinerary_builder"], 1);
    const logistics = selectSkill(skills, ["logistics_brief"], 2);
    const needsApproval = containsAny(message, ["booking", "book", "money", "payment", "purchase", "guest"]);

    return {
      advisor,
      category: routeResult.category,
      confidence: routeResult.confidence,
      summary: "Build a concierge planning flow for preferences, options, timing, and execution readiness.",
      steps: [
        advisorPlanStep(
          "concierge_plan_1",
          advisor,
          planner,
          "Clarify preferences",
          "Collect request details, timing, participant needs, and constraints.",
          "low",
          false,
          "Clarified concierge request",
        ),
        advisorPlanStep(
          "concierge_plan_2",
          advisor,
          itinerary,
          "Shortlist options",
          "Prepare itinerary or option shortlist without booking.",
          "low",
          false,
          "Option shortlist",
        ),
        advisorPlanStep(
          "concierge_plan_3",
          advisor,
          logistics,
          "Prepare logistics",
          "Outline timing, transportation, staffing, and confirmation checkpoints.",
          "medium",
          needsApproval,
          "Logistics brief",
        ),
      ].slice(0, 5),
      safeguards: safeguardsFor(advisor),
      missingInputs: missingInputsFor(advisor, originalMessage),
    };
  }

  if (advisor === "Compliance Advisor") {
    const contract = selectSkill(skills, ["contract_risk_scan"]);
    const privacy = selectSkill(skills, ["privacy_review"], 1);
    const approval = selectSkill(skills, ["approval_required_check"], 2);

    return {
      advisor,
      category: routeResult.category,
      confidence: routeResult.confidence,
      summary: "Build a compliance plan for legal, privacy, contract, and approval risk review.",
      steps: [
        advisorPlanStep(
          "compliance_plan_1",
          advisor,
          contract,
          "Scan contract risk",
          "Identify terms, obligations, indemnity, liability, payment, and termination concerns.",
          "high",
          true,
          "Contract risk summary",
        ),
        advisorPlanStep(
          "compliance_plan_2",
          advisor,
          privacy,
          "Review privacy exposure",
          "Identify personal data, recipients, purpose, retention, and access risks.",
          "high",
          true,
          "Privacy review checklist",
        ),
        advisorPlanStep(
          "compliance_plan_3",
          advisor,
          approval,
          "Confirm approval need",
          "Determine whether qualified review or explicit approval is required before action.",
          "high",
          true,
          "Approval requirement summary",
        ),
      ].slice(0, 5),
      safeguards: safeguardsFor(advisor),
      missingInputs: missingInputsFor(advisor, originalMessage),
    };
  }

  const clarifier = selectSkill(skills, ["request_clarifier"]);
  const router = selectSkill(skills, ["workflow_router"], 1);

  return {
    advisor: "Operations Advisor",
    category: routeResult.category,
    confidence: routeResult.confidence,
    summary: "Clarify the request and route it to the right advisor workflow.",
    steps: [
      advisorPlanStep(
        "operations_plan_1",
        "Operations Advisor",
        clarifier,
        "Clarify objective",
        "Ask for the desired outcome, property context, priority, owner, and deadline.",
        "low",
        false,
        "Clarifying questions",
      ),
      advisorPlanStep(
        "operations_plan_2",
        "Operations Advisor",
        router,
        "Recommend advisor route",
        "Classify the clarified request and recommend the next advisor workflow.",
        "low",
        false,
        "Routing recommendation",
      ),
    ],
    safeguards: safeguardsFor("Operations Advisor"),
    missingInputs: missingInputsFor("Operations Advisor", originalMessage),
  };
}

export function buildActionPlan(routeResult: ActionPlanRouteInput): AdvisorActionPlan {
  if (routeResult.advisor === "Estate Advisor") {
    const propertyHealth = skillById(routeResult.skills, "property_health_check");
    const maintenance = skillById(routeResult.skills, "maintenance_triage");
    const staffBrief = skillById(routeResult.skills, "staff_task_brief");

    return {
      advisor: routeResult.advisor,
      category: routeResult.category,
      summary: "Assess property condition, triage maintenance, and prepare staff instructions.",
      steps: [
        step(
          "estate_step_1",
          propertyHealth,
          "Property health check",
          "Review estate condition signals and open issues.",
          ["estate name", "latest inspection", "open incidents"],
          "Property health summary",
          false,
        ),
        step(
          "estate_step_2",
          maintenance,
          "Maintenance triage",
          "Prioritize maintenance issue and determine next safe action.",
          ["issue description", "affected area", "urgency"],
          "Maintenance triage brief",
          true,
        ),
        step(
          "estate_step_3",
          staffBrief,
          "Staff task brief",
          "Draft clear instructions for estate staff after review.",
          ["task owner", "deadline", "approval notes"],
          "Staff task brief",
          true,
        ),
      ],
      escalation: urgentEstateEscalation(routeResult),
    };
  }

  if (routeResult.advisor === "Security Advisor") {
    const accessReview = skillById(routeResult.skills, "access_review");
    const passwordGuidance = skillById(routeResult.skills, "password_vault_guidance");
    const incidentTriage = skillById(routeResult.skills, "incident_triage");

    return {
      advisor: routeResult.advisor,
      category: routeResult.category,
      summary: "Review security-sensitive request before any credential or access action.",
      steps: [
        step(
          "security_step_1",
          passwordGuidance,
          "Password/access review",
          "Classify credential or access sensitivity.",
          ["requestor", "resource", "business reason"],
          "Credential handling guidance",
          true,
        ),
        step(
          "security_step_2",
          incidentTriage,
          "Risk triage",
          "Determine whether this is normal access, urgent access, or a security incident.",
          ["severity", "property", "affected system"],
          "Security risk triage",
          true,
        ),
        step(
          "security_step_3",
          accessReview,
          "Access change checklist",
          "Prepare checklist for human approval before any access change.",
          ["approval owner", "duration", "access scope"],
          "Access approval checklist",
          true,
        ),
      ],
      escalation: "Requires human approval before credential, vault, access, or security action.",
    };
  }

  if (routeResult.advisor === "Vendor Advisor") {
    const scorecard = skillById(routeResult.skills, "vendor_scorecard");
    const scope = skillById(routeResult.skills, "contractor_scope_builder");
    const quoteComparison = skillById(routeResult.skills, "quote_comparison");

    return {
      advisor: routeResult.advisor,
      category: routeResult.category,
      summary: "Compare vendor options, prepare scope, and document due diligence.",
      steps: [
        step(
          "vendor_step_1",
          scorecard,
          "Contractor/vendor comparison",
          "Compare fit, category, risk, and service area.",
          ["vendor category", "service area", "estate needs"],
          "Vendor comparison notes",
          false,
        ),
        step(
          "vendor_step_2",
          scope,
          "Quote/request checklist",
          "Draft request checklist without contacting vendors.",
          ["scope", "timeline", "constraints"],
          "Vendor request checklist",
          true,
        ),
        step(
          "vendor_step_3",
          quoteComparison,
          "Vendor due diligence",
          "Track quote and due-diligence requirements before selection.",
          ["quotes", "insurance", "license status"],
          "Vendor due-diligence summary",
          true,
        ),
      ],
      escalation: "Requires approval before vendor selection, outreach, or payment.",
    };
  }

  if (routeResult.advisor === "Concierge Advisor") {
    const planner = skillById(routeResult.skills, "lifestyle_request_planner");
    const itinerary = skillById(routeResult.skills, "itinerary_builder");
    const logistics = skillById(routeResult.skills, "logistics_brief");

    return {
      advisor: routeResult.advisor,
      category: routeResult.category,
      summary: "Clarify lifestyle request, shortlist options, and prepare execution checklist.",
      steps: [
        step(
          "concierge_step_1",
          planner,
          "Lifestyle/logistics clarification",
          "Capture preferences, timing, and constraints.",
          ["date", "preferences", "participants"],
          "Clarified concierge request",
          false,
        ),
        step(
          "concierge_step_2",
          itinerary,
          "Option shortlist",
          "Draft possible options without booking or purchasing.",
          ["location", "budget", "availability"],
          "Concierge option shortlist",
          false,
        ),
        step(
          "concierge_step_3",
          logistics,
          "Execution checklist",
          "Prepare execution checklist for human approval before confirmation.",
          ["selected option", "guest-facing details", "approval notes"],
          "Concierge execution checklist",
          true,
        ),
      ],
      escalation: "Requires approval before booking, purchase, or guest-facing confirmation.",
    };
  }

  if (routeResult.advisor === "Compliance Advisor") {
    const contractScan = skillById(routeResult.skills, "contract_risk_scan");
    const privacyReview = skillById(routeResult.skills, "privacy_review");
    const approvalCheck = skillById(routeResult.skills, "approval_required_check");

    return {
      advisor: routeResult.advisor,
      category: routeResult.category,
      summary: "Summarize legal/privacy risk and prepare required review materials.",
      steps: [
        step(
          "compliance_step_1",
          contractScan,
          "Contract/legal/privacy risk summary",
          "Identify legal, privacy, policy, or contract risk topics.",
          ["document text", "counterparty", "policy context"],
          "Compliance risk summary",
          true,
        ),
        step(
          "compliance_step_2",
          privacyReview,
          "Required documents checklist",
          "List documents and context needed for proper review.",
          ["data involved", "recipients", "purpose"],
          "Required documents checklist",
          true,
        ),
        step(
          "compliance_step_3",
          approvalCheck,
          "Escalation recommendation",
          "Determine whether approval or qualified review is mandatory.",
          ["risk level", "policy", "decision owner"],
          "Escalation recommendation",
          true,
        ),
      ],
      escalation: "Requires human approval for legal, privacy, contract, or policy-sensitive work.",
    };
  }

  const clarifier = skillById(routeResult.skills, "request_clarifier");
  const router = skillById(routeResult.skills, "workflow_router");

  return {
    advisor: "Operations Advisor",
    category: routeResult.category,
    summary: "Clarify the request and identify the next best advisor workflow.",
    steps: [
      step(
        "operations_step_1",
        clarifier,
        "Clarify request",
        "Ask for missing context and intended outcome.",
        ["original request", "desired outcome"],
        "Clarifying question",
        false,
      ),
      step(
        "operations_step_2",
        router,
        "Classify next best advisor",
        "Map the clarified request to the likely advisor category.",
        ["clarified category", "urgency", "property context"],
        "Routing recommendation",
        false,
      ),
      step(
        "operations_step_3",
        clarifier,
        "Collect missing details",
        "Collect the minimum fields needed before rerouting.",
        ["tenant", "estate", "priority"],
        "Missing detail checklist",
        false,
      ),
    ],
    escalation: "Needs human review if category remains unclear.",
  };
}
