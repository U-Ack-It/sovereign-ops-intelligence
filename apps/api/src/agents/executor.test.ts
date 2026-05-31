import { executeFirstSkillForRoute, executeSkill, SkillExecutionPlan } from "./executor.js";
import { orchestrateAgentRequest } from "./orchestrator.js";

function assertPlanBasics(plan: SkillExecutionPlan): void {
  if (plan.mode !== "dry_run") {
    throw new Error(`Expected dry_run mode, got ${plan.mode}`);
  }

  if (plan.blockedActions.length === 0) {
    throw new Error(`Expected blockedActions for ${plan.skillId}`);
  }

  if (
    !plan.audit.createdAt ||
    !plan.audit.advisor ||
    !plan.audit.skillId ||
    !plan.audit.risk ||
    !plan.audit.approval ||
    !plan.audit.reason
  ) {
    throw new Error(`Expected audit metadata for ${plan.skillId}`);
  }
}

const estateMaintenance = executeSkill("maintenance_triage", {
  message: "Pool maintenance needs review.",
});
assertPlanBasics(estateMaintenance);

if (estateMaintenance.risk !== "medium" || estateMaintenance.approval !== "recommended") {
  throw new Error("Expected estate maintenance medium risk and approval recommended");
}

const securityAccess = executeSkill("access_review", {
  message: "Vendor needs gate access.",
});
assertPlanBasics(securityAccess);

if (securityAccess.risk !== "high" || securityAccess.approval !== "required") {
  throw new Error("Expected security access high risk and approval required");
}

const securityPassword = executeSkill("password_vault_guidance", {
  message: "Share the Wi-Fi password.",
});
assertPlanBasics(securityPassword);

if (securityPassword.risk !== "high" || securityPassword.approval !== "required") {
  throw new Error("Expected password skill high risk and approval required");
}

const compliance = executeSkill("contract_risk_scan", {
  message: "Review contract privacy risk.",
});
assertPlanBasics(compliance);

if (compliance.risk !== "high" || compliance.approval !== "required") {
  throw new Error("Expected compliance high risk and approval required");
}

const vendor = executeSkill("vendor_scorecard", {
  message: "Review vendor fit.",
});
assertPlanBasics(vendor);

if (vendor.risk !== "medium" || vendor.approval !== "recommended") {
  throw new Error("Expected vendor medium risk and approval recommended");
}

const operations = executeSkill("operations_brief", {
  message: "Please advise.",
});
assertPlanBasics(operations);

if (operations.risk !== "low" || operations.approval !== "not_required") {
  throw new Error("Expected operations fallback low risk and approval not_required");
}

const unknown = executeSkill("missing_skill", {
  message: "Unknown request.",
});
assertPlanBasics(unknown);

if (unknown.advisor !== "Unknown" || unknown.approval !== "required") {
  throw new Error("Expected unknown skill to be handled safely");
}

const route = orchestrateAgentRequest({
  prompt: "The pool maintenance vendor missed the appointment again.",
  tenantId: "local",
  estateId: "estate-1",
  actorUserId: "user-1",
  actorRole: "OWNER",
});
const firstExecution = executeFirstSkillForRoute(route, {
  message: "The pool maintenance vendor missed the appointment again.",
});

if (route.advisor !== "Estate Advisor") {
  throw new Error(`Expected Estate Advisor, got ${route.advisor}`);
}

if (firstExecution.skillId !== "maintenance_triage") {
  throw new Error(`Expected maintenance_triage, got ${firstExecution.skillId}`);
}
