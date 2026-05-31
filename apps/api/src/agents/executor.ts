import type { AgentResponse } from "./orchestrator.js";
import { getSkillById } from "./skills.js";

export type ActionRisk = "low" | "medium" | "high";
export type ApprovalRequirement = "not_required" | "recommended" | "required";
export type ExecutionMode = "dry_run";

export type SkillExecutionRequest = {
  message?: string;
  context?: Record<string, unknown>;
};

export type ExecutionStep = {
  stepId: string;
  title: string;
  description: string;
  status: "planned";
};

export type SkillExecutionPlan = {
  mode: ExecutionMode;
  advisor: string;
  category: string;
  skillId: string;
  skillName: string;
  risk: ActionRisk;
  approval: ApprovalRequirement;
  summary: string;
  steps: ExecutionStep[];
  expectedOutputs: string[];
  blockedActions: string[];
  audit: {
    createdAt: string;
    advisor: string;
    skillId: string;
    risk: ActionRisk;
    approval: ApprovalRequirement;
    reason: string;
    decision: string;
    inputPreview: string;
  };
};

type SkillPlanConfig = {
  advisor: string;
  category: string;
  skillName: string;
  risk: ActionRisk;
  approval: ApprovalRequirement;
  summary: string;
  steps: Omit<ExecutionStep, "status">[];
  expectedOutputs: string[];
  blockedActions: string[];
  reason: string;
};

const DEFAULT_BLOCKED_ACTIONS = [
  "No external vendors are contacted.",
  "No messages, emails, or notifications are sent.",
  "No credentials, contracts, payments, or access settings are changed.",
];

const SKILL_PLANS: Record<string, SkillPlanConfig> = {
  maintenance_triage: {
    advisor: "Estate Advisor",
    category: "property/staff/maintenance",
    skillName: "Maintenance Triage",
    risk: "medium",
    approval: "recommended",
    summary: "Dry-run maintenance triage plan prepared from local request context.",
    steps: [
      {
        stepId: "step_1",
        title: "Classify maintenance issue",
        description: "Identify affected area, urgency, and likely operational impact.",
      },
      {
        stepId: "step_2",
        title: "Prepare human review brief",
        description: "Summarize what a manager should approve before vendor outreach.",
      },
    ],
    expectedOutputs: ["maintenance priority", "manager review brief"],
    blockedActions: DEFAULT_BLOCKED_ACTIONS,
    reason: "Estate maintenance triage can affect vendor actions and should be reviewed.",
  },
  property_health_check: {
    advisor: "Estate Advisor",
    category: "property/staff/maintenance",
    skillName: "Property Health Check",
    risk: "low",
    approval: "recommended",
    summary: "Dry-run property health check plan prepared.",
    steps: [
      {
        stepId: "step_1",
        title: "Review local readiness signals",
        description: "Use local records to identify open property concerns.",
      },
    ],
    expectedOutputs: ["property health summary"],
    blockedActions: DEFAULT_BLOCKED_ACTIONS,
    reason: "Local analysis only; approval is recommended before operational follow-up.",
  },
  staff_task_brief: {
    advisor: "Estate Advisor",
    category: "property/staff/maintenance",
    skillName: "Staff Task Brief",
    risk: "low",
    approval: "recommended",
    summary: "Dry-run staff task brief plan prepared.",
    steps: [
      {
        stepId: "step_1",
        title: "Draft staff instructions",
        description: "Prepare task context, timing, and acceptance criteria.",
      },
    ],
    expectedOutputs: ["staff task brief"],
    blockedActions: DEFAULT_BLOCKED_ACTIONS,
    reason: "Staff-facing instructions should be reviewed before assignment.",
  },
  access_review: {
    advisor: "Security Advisor",
    category: "passwords/access/security",
    skillName: "Access Review",
    risk: "high",
    approval: "required",
    summary: "Dry-run access review plan prepared. No access is granted.",
    steps: [
      {
        stepId: "step_1",
        title: "Verify requestor and purpose",
        description: "Confirm who needs access, why, and for how long.",
      },
      {
        stepId: "step_2",
        title: "Prepare approval checklist",
        description: "List required approvals before any access change.",
      },
    ],
    expectedOutputs: ["access review checklist", "approval requirement"],
    blockedActions: DEFAULT_BLOCKED_ACTIONS,
    reason: "Security access changes require explicit human approval.",
  },
  password_vault_guidance: {
    advisor: "Security Advisor",
    category: "passwords/access/security",
    skillName: "Password Vault Guidance",
    risk: "high",
    approval: "required",
    summary: "Dry-run password guidance prepared. No password is revealed or changed.",
    steps: [
      {
        stepId: "step_1",
        title: "Classify credential sensitivity",
        description: "Identify what type of secret is involved and who requested it.",
      },
    ],
    expectedOutputs: ["credential handling guidance"],
    blockedActions: DEFAULT_BLOCKED_ACTIONS,
    reason: "Password and vault actions are high risk and require approval.",
  },
  incident_triage: {
    advisor: "Security Advisor",
    category: "passwords/access/security",
    skillName: "Incident Triage",
    risk: "high",
    approval: "required",
    summary: "Dry-run security incident triage plan prepared.",
    steps: [
      {
        stepId: "step_1",
        title: "Classify security incident",
        description: "Determine severity, scope, and immediate containment questions.",
      },
    ],
    expectedOutputs: ["incident severity", "containment questions"],
    blockedActions: DEFAULT_BLOCKED_ACTIONS,
    reason: "Security incident response can affect access and privacy.",
  },
  vendor_scorecard: {
    advisor: "Vendor Advisor",
    category: "contractors/vendors",
    skillName: "Vendor Scorecard",
    risk: "medium",
    approval: "recommended",
    summary: "Dry-run vendor scorecard plan prepared.",
    steps: [
      {
        stepId: "step_1",
        title: "Review vendor fit",
        description: "Compare category, service area, and known risk indicators.",
      },
    ],
    expectedOutputs: ["vendor scorecard"],
    blockedActions: DEFAULT_BLOCKED_ACTIONS,
    reason: "Vendor recommendations should be reviewed before outreach.",
  },
  vendor_shortlist: {
    advisor: "Vendor Advisor",
    category: "contractors/vendors",
    skillName: "Vendor Shortlist",
    risk: "medium",
    approval: "recommended",
    summary: "Dry-run vendor shortlist plan prepared.",
    steps: [
      {
        stepId: "step_1",
        title: "Build candidate criteria",
        description: "Identify required category, area, availability, and risk checks.",
      },
    ],
    expectedOutputs: ["vendor shortlist criteria"],
    blockedActions: DEFAULT_BLOCKED_ACTIONS,
    reason: "Vendor selection affects operations and should be reviewed.",
  },
  contractor_scope_builder: {
    advisor: "Vendor Advisor",
    category: "contractors/vendors",
    skillName: "Contractor Scope Builder",
    risk: "medium",
    approval: "recommended",
    summary: "Dry-run contractor scope plan prepared.",
    steps: [
      {
        stepId: "step_1",
        title: "Draft contractor scope",
        description: "Create a scope outline for human review.",
      },
    ],
    expectedOutputs: ["contractor scope draft"],
    blockedActions: DEFAULT_BLOCKED_ACTIONS,
    reason: "Contractor scopes should be reviewed before vendor communication.",
  },
  quote_comparison: {
    advisor: "Vendor Advisor",
    category: "contractors/vendors",
    skillName: "Quote Comparison",
    risk: "medium",
    approval: "recommended",
    summary: "Dry-run quote comparison plan prepared.",
    steps: [
      {
        stepId: "step_1",
        title: "Compare quote scope and cost",
        description: "Review quote fields without approving spend.",
      },
    ],
    expectedOutputs: ["quote comparison summary"],
    blockedActions: DEFAULT_BLOCKED_ACTIONS,
    reason: "Quote decisions may affect spend and vendor commitments.",
  },
  lifestyle_request_planner: {
    advisor: "Concierge Advisor",
    category: "lifestyle/logistics",
    skillName: "Lifestyle Request Planner",
    risk: "low",
    approval: "not_required",
    summary: "Dry-run lifestyle planning prepared. No booking is made.",
    steps: [
      {
        stepId: "step_1",
        title: "Clarify preferences",
        description: "Organize preferences, timing, and constraints.",
      },
    ],
    expectedOutputs: ["lifestyle plan"],
    blockedActions: DEFAULT_BLOCKED_ACTIONS,
    reason: "Planning is local only and does not perform bookings or payments.",
  },
  lifestyle_request_plan: {
    advisor: "Concierge Advisor",
    category: "lifestyle/logistics",
    skillName: "Lifestyle Request Plan",
    risk: "low",
    approval: "not_required",
    summary: "Dry-run lifestyle planning prepared. No booking is made.",
    steps: [
      {
        stepId: "step_1",
        title: "Clarify lifestyle request",
        description: "Organize preferences, timing, and constraints.",
      },
    ],
    expectedOutputs: ["lifestyle plan"],
    blockedActions: DEFAULT_BLOCKED_ACTIONS,
    reason: "Planning is local only and does not perform bookings or payments.",
  },
  itinerary_builder: {
    advisor: "Concierge Advisor",
    category: "lifestyle/logistics",
    skillName: "Itinerary Builder",
    risk: "low",
    approval: "not_required",
    summary: "Dry-run itinerary plan prepared.",
    steps: [
      {
        stepId: "step_1",
        title: "Draft itinerary outline",
        description: "Prepare timing and logistics for review.",
      },
    ],
    expectedOutputs: ["itinerary draft"],
    blockedActions: DEFAULT_BLOCKED_ACTIONS,
    reason: "Itinerary drafting is local only.",
  },
  logistics_brief: {
    advisor: "Concierge Advisor",
    category: "lifestyle/logistics",
    skillName: "Logistics Brief",
    risk: "low",
    approval: "not_required",
    summary: "Dry-run logistics brief prepared.",
    steps: [
      {
        stepId: "step_1",
        title: "Prepare logistics summary",
        description: "Summarize timing, participants, and constraints.",
      },
    ],
    expectedOutputs: ["logistics brief"],
    blockedActions: DEFAULT_BLOCKED_ACTIONS,
    reason: "Briefing is local only.",
  },
  contract_risk_scan: {
    advisor: "Compliance Advisor",
    category: "contracts/risk/legal/privacy",
    skillName: "Contract Risk Scan",
    risk: "high",
    approval: "required",
    summary: "Dry-run contract risk scan prepared. No contract is modified.",
    steps: [
      {
        stepId: "step_1",
        title: "Identify risk topics",
        description: "Flag clauses or themes that need qualified human review.",
      },
    ],
    expectedOutputs: ["contract risk summary"],
    blockedActions: DEFAULT_BLOCKED_ACTIONS,
    reason: "Legal, contract, privacy, and risk work requires human approval.",
  },
  privacy_review: {
    advisor: "Compliance Advisor",
    category: "contracts/risk/legal/privacy",
    skillName: "Privacy Review",
    risk: "high",
    approval: "required",
    summary: "Dry-run privacy review prepared.",
    steps: [
      {
        stepId: "step_1",
        title: "Identify privacy exposure",
        description: "List data types, recipients, and approval questions.",
      },
    ],
    expectedOutputs: ["privacy review checklist"],
    blockedActions: DEFAULT_BLOCKED_ACTIONS,
    reason: "Privacy decisions require human review.",
  },
  approval_required_check: {
    advisor: "Compliance Advisor",
    category: "contracts/risk/legal/privacy",
    skillName: "Approval Required Check",
    risk: "high",
    approval: "required",
    summary: "Dry-run approval requirement check prepared.",
    steps: [
      {
        stepId: "step_1",
        title: "Check approval policy",
        description: "Identify whether manual approval is required.",
      },
    ],
    expectedOutputs: ["approval decision support"],
    blockedActions: DEFAULT_BLOCKED_ACTIONS,
    reason: "Compliance decisions require human confirmation.",
  },
  operations_brief: {
    advisor: "Operations Advisor",
    category: "unknown/unclear",
    skillName: "Operations Brief",
    risk: "low",
    approval: "not_required",
    summary: "Dry-run operations brief prepared for unclear request routing.",
    steps: [
      {
        stepId: "step_1",
        title: "Clarify request",
        description: "Ask for missing context before routing to a specialist advisor.",
      },
    ],
    expectedOutputs: ["clarifying questions"],
    blockedActions: DEFAULT_BLOCKED_ACTIONS,
    reason: "Fallback planning is local only.",
  },
  request_clarifier: {
    advisor: "Operations Advisor",
    category: "unknown/unclear",
    skillName: "Request Clarifier",
    risk: "low",
    approval: "not_required",
    summary: "Dry-run request clarification plan prepared.",
    steps: [
      {
        stepId: "step_1",
        title: "Ask clarifying question",
        description: "Determine the missing intent or operational context.",
      },
    ],
    expectedOutputs: ["clarifying question"],
    blockedActions: DEFAULT_BLOCKED_ACTIONS,
    reason: "Clarification has no external side effects.",
  },
  workflow_router: {
    advisor: "Operations Advisor",
    category: "unknown/unclear",
    skillName: "Workflow Router",
    risk: "low",
    approval: "not_required",
    summary: "Dry-run workflow routing plan prepared.",
    steps: [
      {
        stepId: "step_1",
        title: "Select likely workflow",
        description: "Recommend the next advisor category after clarification.",
      },
    ],
    expectedOutputs: ["routing recommendation"],
    blockedActions: DEFAULT_BLOCKED_ACTIONS,
    reason: "Routing recommendation has no external side effects.",
  },
};

function inputPreview(input: SkillExecutionRequest): string {
  const preview = JSON.stringify(input);
  return preview.length > 240 ? `${preview.slice(0, 237)}...` : preview;
}

function buildPlan(
  skillId: string,
  input: SkillExecutionRequest,
  config: SkillPlanConfig,
): SkillExecutionPlan {
  return {
    mode: "dry_run",
    advisor: config.advisor,
    category: config.category,
    skillId,
    skillName: config.skillName,
    risk: config.risk,
    approval: config.approval,
    summary: config.summary,
    steps: config.steps.map((step) => ({ ...step, status: "planned" })),
    expectedOutputs: config.expectedOutputs,
    blockedActions: config.blockedActions,
    audit: {
      createdAt: new Date().toISOString(),
      advisor: config.advisor,
      skillId,
      risk: config.risk,
      approval: config.approval,
      reason: config.reason,
      decision: "dry_run_plan_created",
      inputPreview: inputPreview(input),
    },
  };
}

function unknownSkillPlan(skillId: string, input: SkillExecutionRequest): SkillExecutionPlan {
  return buildPlan(skillId, input, {
    advisor: "Unknown",
    category: "unknown",
    skillName: "Unknown Skill",
    risk: "low",
    approval: "required",
    summary: "Unknown skill id. No action was planned or executed.",
    steps: [
      {
        stepId: "step_1",
        title: "Verify skill id",
        description: "Confirm that the requested skill exists in the advisor registry.",
      },
    ],
    expectedOutputs: ["safe failure notice"],
    blockedActions: DEFAULT_BLOCKED_ACTIONS,
    reason: "Unknown skill ids are handled as safe dry-run failures.",
  });
}

export function executeSkill(
  skillId: string,
  input: SkillExecutionRequest = {},
): SkillExecutionPlan {
  const config = SKILL_PLANS[skillId];

  if (config) {
    return buildPlan(skillId, input, config);
  }

  const registrySkill = getSkillById(skillId);

  if (!registrySkill) {
    return unknownSkillPlan(skillId, input);
  }

  return buildPlan(skillId, input, {
    advisor: registrySkill.advisor,
    category: registrySkill.category,
    skillName: registrySkill.name,
    risk: registrySkill.riskLevel.toLowerCase() as ActionRisk,
    approval: "recommended",
    summary: `Dry-run plan prepared for ${registrySkill.name}.`,
    steps: [
      {
        stepId: "step_1",
        title: "Prepare local analysis",
        description: registrySkill.description,
      },
    ],
    expectedOutputs: [registrySkill.outputType],
    blockedActions: DEFAULT_BLOCKED_ACTIONS,
    reason: "Registered skill without a custom handler uses a safe dry-run plan.",
  });
}

export function executeFirstSkillForRoute(
  routeResult: AgentResponse,
  input: SkillExecutionRequest = {},
): SkillExecutionPlan {
  const firstSkill = routeResult.skills[0];

  if (!firstSkill) {
    return executeSkill("operations_brief", input);
  }

  return executeSkill(firstSkill.id, input);
}
