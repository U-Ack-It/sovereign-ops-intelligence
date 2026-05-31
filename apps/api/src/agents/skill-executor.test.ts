import { ADVISOR_SKILLS } from "./skills.js";
import { executeSkill } from "./skill-executor.js";

for (const skill of ADVISOR_SKILLS) {
  const result = executeSkill(skill.id, {
    message: "General advisor execution request.",
    urgency: "medium",
    propertyName: "Test Estate",
    vendorType: "maintenance",
    contractType: "service agreement",
  });

  if (result.status === "not_found") {
    throw new Error(`Expected known skill ${skill.id} to execute`);
  }

  if (result.advisor !== skill.advisor) {
    throw new Error(`Expected ${skill.id} advisor ${skill.advisor}, got ${result.advisor}`);
  }

  if (!Array.isArray(result.recommendedSteps)) {
    throw new Error(`Expected ${skill.id} recommendedSteps array`);
  }
}

const unknown = executeSkill("missing_skill", { message: "Unknown skill." });

if (unknown.status !== "not_found") {
  throw new Error(`Expected unknown skill not_found, got ${unknown.status}`);
}

const maintenanceMissingUrgency = executeSkill("maintenance_triage", {
  message: "Pool pump maintenance issue.",
});

if (maintenanceMissingUrgency.status !== "needs_input") {
  throw new Error(
    `Expected maintenance_triage without urgency to need input, got ${maintenanceMissingUrgency.status}`,
  );
}

const maintenanceComplete = executeSkill("maintenance_triage", {
  message: "Pool pump maintenance issue.",
  urgency: "medium",
});

if (maintenanceComplete.status !== "completed") {
  throw new Error(
    `Expected maintenance_triage with urgency to complete, got ${maintenanceComplete.status}`,
  );
}

if (maintenanceComplete.advisor !== "Estate Advisor") {
  throw new Error(`Expected Estate Advisor, got ${maintenanceComplete.advisor}`);
}

if (maintenanceComplete.recommendedSteps.length === 0) {
  throw new Error("Expected maintenance_triage recommendedSteps");
}
