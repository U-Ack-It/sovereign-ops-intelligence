import type { SkillDefinition } from "./skills.js";

export type ExecutionRiskLevel = "low" | "medium" | "high";
export type PlanPriority = "low" | "medium" | "high";

export type ToolDefinition = {
  id: string;
  name: string;
  type: "analysis" | "checklist" | "draft" | "triage" | "review";
  description: string;
};

export type RiskFlag = {
  id: string;
  level: ExecutionRiskLevel;
  reason: string;
};

export type PlannerInput = {
  routeResult: ExecutionPlanRouteInput;
  originalText: string;
};

export type SkillExecutionPlan = {
  selectedSkill: SkillDefinition;
  priority: PlanPriority;
  missingInputs: string[];
  recommendedTools: ToolDefinition[];
  riskFlags: RiskFlag[];
  checklist: string[];
  handoff: {
    advisor: string;
    message: string;
  };
  auditTrail: {
    createdAt: string;
    advisor: string;
    selectedSkillId: string;
    reason: string;
  };
};

export type ExecutionPlanStep = {
  stepId: string;
  skillId: string;
  title: string;
  description: string;
  toolType: "analysis" | "checklist" | "draft" | "triage" | "review";
  status: "planned";
};

export type ExecutionPlan = {
  planId: string;
  advisor: string;
  summary: string;
  requiresHumanApproval: boolean;
  riskLevel: ExecutionRiskLevel;
  steps: ExecutionPlanStep[];
};

export type ExecutionPlanRouteInput = {
  advisor: string;
  category?: string;
  matchedKeywords: string[];
  skills: SkillDefinition[];
};

export const TOOL_REGISTRY: ToolDefinition[] = [
  {
    id: "calendar_check",
    name: "Calendar Check",
    type: "analysis",
    description: "Review local schedule context before planning.",
  },
  {
    id: "vendor_lookup",
    name: "Vendor Lookup",
    type: "analysis",
    description: "Review local vendor records without contacting vendors.",
  },
  {
    id: "password_vault_review",
    name: "Password Vault Review",
    type: "review",
    description: "Prepare a secure review checklist for vault or access requests.",
  },
  {
    id: "document_risk_scan",
    name: "Document Risk Scan",
    type: "review",
    description: "Identify local document risk topics for human review.",
  },
  {
    id: "maintenance_ticket_builder",
    name: "Maintenance Ticket Builder",
    type: "triage",
    description: "Draft a maintenance ticket without sending it.",
  },
  {
    id: "concierge_itinerary_builder",
    name: "Concierge Itinerary Builder",
    type: "draft",
    description: "Draft lifestyle or logistics itinerary details.",
  },
  {
    id: "compliance_review_queue",
    name: "Compliance Review Queue",
    type: "checklist",
    description: "Prepare compliance review queue items.",
  },
  {
    id: "operations_summary",
    name: "Operations Summary",
    type: "analysis",
    description: "Summarize unclear requests for routing.",
  },
];

function skillById(skills: SkillDefinition[], skillId: string): SkillDefinition | undefined {
  return skills.find((skill) => skill.id === skillId);
}

function toolById(toolId: string): ToolDefinition {
  const tool = TOOL_REGISTRY.find((item) => item.id === toolId);

  if (!tool) {
    throw new Error(`Missing tool definition: ${toolId}`);
  }

  return tool;
}

function firstAvailableSkill(
  routeResult: ExecutionPlanRouteInput,
  preferredIds: string[],
): SkillDefinition {
  for (const skillId of preferredIds) {
    const skill = skillById(routeResult.skills, skillId);

    if (skill) {
      return skill;
    }
  }

  const fallbackSkill = routeResult.skills[0];

  if (!fallbackSkill) {
    throw new Error(`No skills available for ${routeResult.advisor}`);
  }

  return fallbackSkill;
}

function skillStep(
  stepNumber: number,
  skill: SkillDefinition,
  toolType: ExecutionPlanStep["toolType"],
): ExecutionPlanStep {
  return {
    stepId: `step_${stepNumber}`,
    skillId: skill.id,
    title: skill.name,
    description: skill.description,
    toolType,
    status: "planned",
  };
}

function preferredSkillIds(routeResult: ExecutionPlanRouteInput): string[] {
  if (routeResult.advisor === "Estate Advisor") {
    if (routeResult.matchedKeywords.includes("maintenance")) {
      return ["maintenance_triage", "property_health_check", "staff_task_brief"];
    }

    return ["property_health_check", "maintenance_triage", "staff_task_brief"];
  }

  if (routeResult.advisor === "Security Advisor") {
    return ["access_review", "password_vault_guidance", "incident_triage"];
  }

  if (routeResult.advisor === "Vendor Advisor") {
    return ["vendor_scorecard", "contractor_scope_builder", "quote_comparison"];
  }

  if (routeResult.advisor === "Concierge Advisor") {
    return ["lifestyle_request_planner", "itinerary_builder", "logistics_brief"];
  }

  if (routeResult.advisor === "Compliance Advisor") {
    return ["contract_risk_scan", "privacy_review", "approval_required_check"];
  }

  return ["request_clarifier", "workflow_router"];
}

function toolTypeForSkill(skillId: string): ExecutionPlanStep["toolType"] {
  if (skillId.includes("triage")) {
    return "triage";
  }

  if (skillId.includes("check") || skillId.includes("review") || skillId.includes("scan")) {
    return "review";
  }

  if (skillId.includes("brief") || skillId.includes("builder")) {
    return "draft";
  }

  if (skillId.includes("planner") || skillId.includes("router")) {
    return "checklist";
  }

  return "analysis";
}

function planRiskLevel(routeResult: ExecutionPlanRouteInput): ExecutionRiskLevel {
  if (routeResult.advisor === "Security Advisor" || routeResult.advisor === "Compliance Advisor") {
    return "high";
  }

  if (routeResult.advisor === "Vendor Advisor") {
    return "medium";
  }

  if (routeResult.advisor === "Estate Advisor") {
    return routeResult.matchedKeywords.includes("maintenance") ? "medium" : "low";
  }

  return "low";
}

function requiresApproval(routeResult: ExecutionPlanRouteInput): boolean {
  if (routeResult.advisor === "Concierge Advisor") {
    return routeResult.matchedKeywords.some((keyword) =>
      ["money", "payment", "booking"].includes(keyword),
    );
  }

  if (routeResult.advisor === "Operations Advisor") {
    return false;
  }

  return true;
}

export function buildExecutionPlan(routeResult: ExecutionPlanRouteInput): ExecutionPlan {
  const preferredIds = preferredSkillIds(routeResult);
  const orderedSkills = preferredIds
    .map((skillId) => skillById(routeResult.skills, skillId))
    .filter((skill): skill is SkillDefinition => Boolean(skill));

  const fallbackSkills = routeResult.skills.filter(
    (skill) => !orderedSkills.some((orderedSkill) => orderedSkill.id === skill.id),
  );
  const skills = [...orderedSkills, ...fallbackSkills];

  return {
    planId: `plan_${routeResult.advisor.toLowerCase().replaceAll(" ", "_")}`,
    advisor: routeResult.advisor,
    summary: `Prepare a safe local execution plan for ${routeResult.advisor}.`,
    requiresHumanApproval: requiresApproval(routeResult),
    riskLevel: planRiskLevel(routeResult),
    steps: skills.map((skill, index) => skillStep(index + 1, skill, toolTypeForSkill(skill.id))),
  };
}

function preferredToolIds(routeResult: ExecutionPlanRouteInput): string[] {
  if (routeResult.advisor === "Estate Advisor") {
    return ["maintenance_ticket_builder", "calendar_check", "operations_summary"];
  }

  if (routeResult.advisor === "Security Advisor") {
    return ["password_vault_review", "operations_summary"];
  }

  if (routeResult.advisor === "Vendor Advisor") {
    return ["vendor_lookup", "calendar_check", "operations_summary"];
  }

  if (routeResult.advisor === "Concierge Advisor") {
    return ["concierge_itinerary_builder", "calendar_check"];
  }

  if (routeResult.advisor === "Compliance Advisor") {
    return ["document_risk_scan", "compliance_review_queue"];
  }

  return ["operations_summary"];
}

function selectedSkillForRoute(routeResult: ExecutionPlanRouteInput): SkillDefinition {
  if (routeResult.advisor === "Estate Advisor") {
    return firstAvailableSkill(routeResult, [
      "maintenance_triage",
      "property_health_check",
      "staff_task_brief",
    ]);
  }

  if (routeResult.advisor === "Security Advisor") {
    return firstAvailableSkill(routeResult, [
      "access_review",
      "password_vault_guidance",
      "incident_triage",
    ]);
  }

  if (routeResult.advisor === "Vendor Advisor") {
    return firstAvailableSkill(routeResult, [
      "vendor_scorecard",
      "contractor_scope_builder",
      "quote_comparison",
    ]);
  }

  if (routeResult.advisor === "Concierge Advisor") {
    return firstAvailableSkill(routeResult, [
      "lifestyle_request_planner",
      "itinerary_builder",
      "logistics_brief",
    ]);
  }

  if (routeResult.advisor === "Compliance Advisor") {
    return firstAvailableSkill(routeResult, [
      "contract_risk_scan",
      "privacy_review",
      "approval_required_check",
    ]);
  }

  return firstAvailableSkill(routeResult, ["request_clarifier", "workflow_router"]);
}

function riskFlagsForRoute(routeResult: ExecutionPlanRouteInput): RiskFlag[] {
  if (routeResult.advisor === "Security Advisor") {
    return [
      {
        id: "security_approval_required",
        level: "high",
        reason: "Access, password, or security requests require review before action.",
      },
    ];
  }

  if (routeResult.advisor === "Compliance Advisor") {
    return [
      {
        id: "compliance_review_required",
        level: "high",
        reason: "Contract, privacy, legal, or risk requests require compliance review.",
      },
    ];
  }

  if (routeResult.advisor === "Vendor Advisor") {
    return [
      {
        id: "vendor_commitment_risk",
        level: "medium",
        reason: "Vendor recommendations must not trigger outreach or commitments automatically.",
      },
    ];
  }

  if (
    routeResult.advisor === "Estate Advisor" &&
    routeResult.matchedKeywords.includes("maintenance")
  ) {
    return [
      {
        id: "maintenance_followup_review",
        level: "medium",
        reason: "Maintenance triage can lead to vendor work and should be reviewed.",
      },
    ];
  }

  return [];
}

function priorityForRoute(routeResult: ExecutionPlanRouteInput): PlanPriority {
  if (routeResult.advisor === "Security Advisor" || routeResult.advisor === "Compliance Advisor") {
    return "high";
  }

  if (
    routeResult.advisor === "Vendor Advisor" ||
    routeResult.matchedKeywords.includes("maintenance")
  ) {
    return "medium";
  }

  return "low";
}

function checklistForRoute(routeResult: ExecutionPlanRouteInput, selectedSkill: SkillDefinition): string[] {
  return [
    `Confirm advisor: ${routeResult.advisor}`,
    `Confirm selected skill: ${selectedSkill.id}`,
    "Review missing inputs before execution.",
    "Keep all actions local until human approval is granted when required.",
  ];
}

function missingInputsForRoute(routeResult: ExecutionPlanRouteInput, originalText: string): string[] {
  const missingInputs: string[] = [];

  if (!originalText.trim()) {
    missingInputs.push("original request text");
  }

  if (routeResult.advisor !== "Operations Advisor" && !routeResult.category) {
    missingInputs.push("route category");
  }

  if (routeResult.advisor === "Vendor Advisor") {
    missingInputs.push("vendor scope");
  }

  if (routeResult.advisor === "Security Advisor") {
    missingInputs.push("approval owner");
  }

  return missingInputs;
}

export function buildSkillExecutionPlan(
  routeResult: ExecutionPlanRouteInput,
  originalText: string,
): SkillExecutionPlan {
  const selectedSkill = selectedSkillForRoute(routeResult);
  const recommendedTools = preferredToolIds(routeResult).map((toolId) => toolById(toolId));

  return {
    selectedSkill,
    priority: priorityForRoute(routeResult),
    missingInputs: missingInputsForRoute(routeResult, originalText),
    recommendedTools,
    riskFlags: riskFlagsForRoute(routeResult),
    checklist: checklistForRoute(routeResult, selectedSkill),
    handoff: {
      advisor: routeResult.advisor,
      message: `Prepare ${selectedSkill.name} using local dry-run tools only.`,
    },
    auditTrail: {
      createdAt: new Date().toISOString(),
      advisor: routeResult.advisor,
      selectedSkillId: selectedSkill.id,
      reason: `Selected ${selectedSkill.id} for ${routeResult.advisor}.`,
    },
  };
}
