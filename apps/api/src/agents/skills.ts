export type RiskLevel = "Low" | "Medium" | "High" | "Critical";

export type SkillDefinition = {
  id: string;
  name: string;
  advisor: string;
  category: string;
  description: string;
  inputHints: string[];
  outputType: string;
  riskLevel: RiskLevel;
};

export const ADVISOR_SKILLS: SkillDefinition[] = [
  {
    id: "property_health_check",
    name: "Property Health Check",
    advisor: "Estate Advisor",
    category: "property/staff/maintenance",
    description: "Summarize property readiness, open issues, and maintenance risk.",
    inputHints: ["estateId", "inspection history", "incident history"],
    outputType: "property_health_summary",
    riskLevel: "Medium",
  },
  {
    id: "maintenance_triage",
    name: "Maintenance Triage",
    advisor: "Estate Advisor",
    category: "property/staff/maintenance",
    description: "Prioritize maintenance issues by urgency and operational impact.",
    inputHints: ["issue description", "severity", "affected area"],
    outputType: "maintenance_priority_plan",
    riskLevel: "Medium",
  },
  {
    id: "staff_task_brief",
    name: "Staff Task Brief",
    advisor: "Estate Advisor",
    category: "property/staff/maintenance",
    description: "Create a clear task brief for estate staff.",
    inputHints: ["task", "deadline", "assigned staff"],
    outputType: "staff_task_brief",
    riskLevel: "Low",
  },
  {
    id: "access_review",
    name: "Access Review",
    advisor: "Security Advisor",
    category: "passwords/access/security",
    description: "Review a requested access change before approval.",
    inputHints: ["resource", "requestor", "reason"],
    outputType: "access_review",
    riskLevel: "High",
  },
  {
    id: "password_vault_guidance",
    name: "Password Vault Guidance",
    advisor: "Security Advisor",
    category: "passwords/access/security",
    description: "Guide secure handling of vault or password requests.",
    inputHints: ["credential type", "recipient", "purpose"],
    outputType: "security_guidance",
    riskLevel: "High",
  },
  {
    id: "incident_triage",
    name: "Incident Triage",
    advisor: "Security Advisor",
    category: "passwords/access/security",
    description: "Classify and route a security incident.",
    inputHints: ["incident type", "severity", "property"],
    outputType: "incident_triage",
    riskLevel: "High",
  },
  {
    id: "vendor_scorecard",
    name: "Vendor Scorecard",
    advisor: "Vendor Advisor",
    category: "contractors/vendors",
    description: "Score vendor fit, reliability, and risk.",
    inputHints: ["vendor", "category", "service area"],
    outputType: "vendor_scorecard",
    riskLevel: "Medium",
  },
  {
    id: "contractor_scope_builder",
    name: "Contractor Scope Builder",
    advisor: "Vendor Advisor",
    category: "contractors/vendors",
    description: "Draft a clear work scope for contractor requests.",
    inputHints: ["work needed", "property", "timeline"],
    outputType: "contractor_scope",
    riskLevel: "Medium",
  },
  {
    id: "quote_comparison",
    name: "Quote Comparison",
    advisor: "Vendor Advisor",
    category: "contractors/vendors",
    description: "Compare vendor quotes for cost, scope, and risk.",
    inputHints: ["quotes", "scope", "constraints"],
    outputType: "quote_comparison",
    riskLevel: "Medium",
  },
  {
    id: "lifestyle_request_planner",
    name: "Lifestyle Request Planner",
    advisor: "Concierge Advisor",
    category: "lifestyle/logistics",
    description: "Plan lifestyle requests with logistics and preferences.",
    inputHints: ["request", "date", "preferences"],
    outputType: "lifestyle_plan",
    riskLevel: "Low",
  },
  {
    id: "itinerary_builder",
    name: "Itinerary Builder",
    advisor: "Concierge Advisor",
    category: "lifestyle/logistics",
    description: "Build a simple itinerary for travel or events.",
    inputHints: ["location", "dates", "participants"],
    outputType: "itinerary",
    riskLevel: "Low",
  },
  {
    id: "logistics_brief",
    name: "Logistics Brief",
    advisor: "Concierge Advisor",
    category: "lifestyle/logistics",
    description: "Summarize transportation, timing, and coordination details.",
    inputHints: ["destination", "schedule", "constraints"],
    outputType: "logistics_brief",
    riskLevel: "Low",
  },
  {
    id: "contract_risk_scan",
    name: "Contract Risk Scan",
    advisor: "Compliance Advisor",
    category: "contracts/risk/legal/privacy",
    description: "Identify obvious contractual risk areas for review.",
    inputHints: ["contract text", "vendor", "estate"],
    outputType: "contract_risk_summary",
    riskLevel: "High",
  },
  {
    id: "privacy_review",
    name: "Privacy Review",
    advisor: "Compliance Advisor",
    category: "contracts/risk/legal/privacy",
    description: "Review requests for privacy and data exposure concerns.",
    inputHints: ["data involved", "recipient", "purpose"],
    outputType: "privacy_review",
    riskLevel: "High",
  },
  {
    id: "approval_required_check",
    name: "Approval Required Check",
    advisor: "Compliance Advisor",
    category: "contracts/risk/legal/privacy",
    description: "Determine whether a request requires manual approval.",
    inputHints: ["request", "risk level", "policy"],
    outputType: "approval_check",
    riskLevel: "Medium",
  },
  {
    id: "request_clarifier",
    name: "Request Clarifier",
    advisor: "Operations Advisor",
    category: "unknown/unclear",
    description: "Ask targeted questions to clarify ambiguous requests.",
    inputHints: ["original request", "missing context"],
    outputType: "clarifying_questions",
    riskLevel: "Low",
  },
  {
    id: "workflow_router",
    name: "Workflow Router",
    advisor: "Operations Advisor",
    category: "unknown/unclear",
    description: "Route unclear requests to the right operational workflow.",
    inputHints: ["request", "tenant", "estate"],
    outputType: "routing_recommendation",
    riskLevel: "Low",
  },
];

export function getSkillsForAdvisor(advisor: string): SkillDefinition[] {
  return ADVISOR_SKILLS.filter((skill) => skill.advisor === advisor);
}

export function getSkillById(id: string): SkillDefinition | undefined {
  return ADVISOR_SKILLS.find((skill) => skill.id === id);
}
