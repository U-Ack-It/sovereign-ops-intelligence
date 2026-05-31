import { ADVISOR_SKILLS, SkillDefinition, getSkillById } from "./skills.js";

export type SkillExecutionStatus = "completed" | "needs_input" | "not_found";

export type SkillExecutionContext = {
  message?: string;
  advisor?: string;
  category?: string;
  propertyName?: string;
  urgency?: string;
  vendorType?: string;
  contractType?: string;
  riskLevel?: string;
  notes?: string;
};

export type SkillExecutionRequest = {
  skillId: string;
  context: SkillExecutionContext;
};

export type SkillExecutionResult = {
  skillId: string;
  advisor: string;
  status: SkillExecutionStatus;
  summary: string;
  requiredInputs: string[];
  missingInputs: string[];
  recommendedSteps: string[];
  riskFlags: string[];
  handoffNotes: string;
};

type SkillHandler = (
  skill: SkillDefinition,
  context: SkillExecutionContext,
) => SkillExecutionResult;

function hasText(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function baseResult(
  skill: SkillDefinition,
  context: SkillExecutionContext,
  summary: string,
  recommendedSteps: string[],
  riskFlags: string[],
  handoffNotes: string,
  requiredInputs = skill.inputHints,
): SkillExecutionResult {
  const missingInputs = requiredInputs.filter((input) => {
    const normalized = input.toLowerCase();

    if (normalized.includes("urgency") || normalized.includes("severity")) {
      return !hasText(context.urgency) && !hasText(context.riskLevel);
    }

    if (normalized.includes("vendor") || normalized.includes("contractor")) {
      return !hasText(context.vendorType) && !hasText(context.message);
    }

    if (normalized.includes("contract")) {
      return !hasText(context.contractType) && !hasText(context.message);
    }

    if (normalized.includes("property") || normalized.includes("estate")) {
      return !hasText(context.propertyName) && !hasText(context.message);
    }

    if (normalized.includes("request") || normalized.includes("issue") || normalized.includes("task")) {
      return !hasText(context.message) && !hasText(context.notes);
    }

    return false;
  });

  return {
    skillId: skill.id,
    advisor: skill.advisor,
    status: missingInputs.length > 0 ? "needs_input" : "completed",
    summary,
    requiredInputs,
    missingInputs,
    recommendedSteps,
    riskFlags,
    handoffNotes,
  };
}

function maintenanceTriage(
  skill: SkillDefinition,
  context: SkillExecutionContext,
): SkillExecutionResult {
  const requiredInputs = ["message", "urgency"];
  const missingInputs = [
    hasText(context.message) ? null : "message",
    hasText(context.urgency) ? null : "urgency",
  ].filter((input): input is string => input !== null);

  return {
    skillId: skill.id,
    advisor: skill.advisor,
    status: missingInputs.length > 0 ? "needs_input" : "completed",
    summary: "Plan-only maintenance triage for estate operations.",
    requiredInputs,
    missingInputs,
    recommendedSteps: [
      "Classify severity and affected property area.",
      "Document photos, symptoms, timing, and operational impact.",
      "Prepare vendor dispatch criteria for human approval.",
      "Set a follow-up checkpoint after the issue is reviewed.",
    ],
    riskFlags: ["Vendor dispatch requires approval before any real-world action."],
    handoffNotes: "Send to Estate Advisor or estate manager for review before contacting vendors.",
  };
}

function propertyHealthCheck(
  skill: SkillDefinition,
  context: SkillExecutionContext,
): SkillExecutionResult {
  return baseResult(
    skill,
    context,
    "Plan-only property health check with inspection categories.",
    [
      "Review exterior, entry, windows, roofline, and storm readiness.",
      "Check HVAC, moisture, electrical, pool, landscape, and pest indicators.",
      "Group issues by safety, property damage, maintenance, and comfort.",
      "Prepare a concise property health summary for owner review.",
    ],
    ["Escalate safety or property damage concerns for human review."],
    "Use this as an inspection planning checklist, not an automated inspection result.",
  );
}

function staffTaskBrief(
  skill: SkillDefinition,
  context: SkillExecutionContext,
): SkillExecutionResult {
  return baseResult(
    skill,
    context,
    "Plan-only staff task brief template.",
    [
      "State the task objective in one sentence.",
      "List assigned staff, deadline, location, and materials needed.",
      "Add completion criteria and reporting instructions.",
      "Hold execution until the task owner approves the brief.",
    ],
    ["Staff direction should be reviewed before assignment."],
    "Share with the Estate Advisor or estate manager before issuing instructions.",
  );
}

function securityReview(
  skill: SkillDefinition,
  context: SkillExecutionContext,
): SkillExecutionResult {
  return baseResult(
    skill,
    context,
    "Plan-only security review for password, access, vault, or incident requests.",
    [
      "Verify requestor identity, role, property, and business reason.",
      "Confirm least-privilege access scope and expiration.",
      "Use MFA and vault hygiene checks before any credential handling.",
      "Prepare an approval checklist before access, reset, or disclosure.",
    ],
    [
      "No password changes, access grants, vault sharing, or alarm changes are performed.",
      "Security-sensitive requests require human approval.",
    ],
    "Route to Security Advisor for manual approval before any credential or access action.",
  );
}

function vendorPlan(
  skill: SkillDefinition,
  context: SkillExecutionContext,
): SkillExecutionResult {
  return baseResult(
    skill,
    context,
    "Plan-only vendor workflow for vetting, scope, and comparison.",
    [
      "Clarify service category, property constraints, timeline, and budget range.",
      "Check license, insurance, availability, references, and emergency coverage.",
      "Compare scope, exclusions, price, response time, and risk.",
      "Prepare a recommendation packet for approval before selection or payment.",
    ],
    ["Vendor outreach, selection, and payment require approval."],
    "Route to Vendor Advisor with collected scope and due-diligence notes.",
  );
}

function conciergePlan(
  skill: SkillDefinition,
  context: SkillExecutionContext,
): SkillExecutionResult {
  return baseResult(
    skill,
    context,
    "Plan-only concierge workflow for itinerary and logistics planning.",
    [
      "Clarify date, location, preferences, participants, and constraints.",
      "Build a shortlist of options without booking or purchasing.",
      "Prepare timing, transportation, staffing, and communication checklist.",
      "Request approval before guest-facing confirmations or payments.",
    ],
    ["Bookings, purchases, and confirmations require approval."],
    "Route to Concierge Advisor once preferences and approval owner are known.",
  );
}

function compliancePlan(
  skill: SkillDefinition,
  context: SkillExecutionContext,
): SkillExecutionResult {
  return baseResult(
    skill,
    context,
    "Plan-only compliance checklist for contract, privacy, legal, or risk review.",
    [
      "Identify document type, parties, sensitive data, and decision deadline.",
      "Flag indemnity, liability, privacy, payment, access, and termination terms.",
      "List missing documents and policy context needed for review.",
      "Escalate to qualified human review before legal or policy decisions.",
    ],
    ["No legal advice, approval, signature, or policy decision is performed."],
    "Route to Compliance Advisor with source documents and risk context.",
  );
}

function operationsPlan(
  skill: SkillDefinition,
  context: SkillExecutionContext,
): SkillExecutionResult {
  return baseResult(
    skill,
    context,
    "Plan-only operations fallback for unclear requests.",
    [
      "Restate the request and identify the intended outcome.",
      "Collect missing property, urgency, actor, and category details.",
      "Recommend the next best advisor route.",
      "Ask for human review if the category remains unclear.",
    ],
    ["Unclear requests should not trigger real-world action."],
    "Use Operations Advisor to clarify and reroute the request.",
    ["message"],
  );
}

const HANDLERS: Record<string, SkillHandler> = {
  property_health_check: propertyHealthCheck,
  maintenance_triage: maintenanceTriage,
  staff_task_brief: staffTaskBrief,
  access_review: securityReview,
  password_vault_guidance: securityReview,
  incident_triage: securityReview,
  vendor_scorecard: vendorPlan,
  contractor_scope_builder: vendorPlan,
  quote_comparison: vendorPlan,
  lifestyle_request_planner: conciergePlan,
  itinerary_builder: conciergePlan,
  logistics_brief: conciergePlan,
  contract_risk_scan: compliancePlan,
  privacy_review: compliancePlan,
  approval_required_check: compliancePlan,
  request_clarifier: operationsPlan,
  workflow_router: operationsPlan,
};

export function executeSkill(
  skillId: string,
  context: SkillExecutionContext,
): SkillExecutionResult {
  const skill = getSkillById(skillId);

  if (!skill) {
    return {
      skillId,
      advisor: "Unknown",
      status: "not_found",
      summary: "Skill was not found in the advisor skill registry.",
      requiredInputs: [],
      missingInputs: [],
      recommendedSteps: [],
      riskFlags: ["Unknown skills cannot be executed."],
      handoffNotes: "Check the skill id and retry with a registered skill.",
    };
  }

  const handler = HANDLERS[skill.id];

  if (!handler) {
    return {
      skillId: skill.id,
      advisor: skill.advisor,
      status: "not_found",
      summary: "Skill exists but no execution handler is registered.",
      requiredInputs: skill.inputHints,
      missingInputs: [],
      recommendedSteps: [],
      riskFlags: ["Missing handler prevents execution."],
      handoffNotes: "Add a deterministic handler before exposing this skill.",
    };
  }

  return handler(skill, context);
}

export function executeAllRegisteredSkills(
  context: SkillExecutionContext,
): SkillExecutionResult[] {
  return ADVISOR_SKILLS.map((skill) => executeSkill(skill.id, context));
}
