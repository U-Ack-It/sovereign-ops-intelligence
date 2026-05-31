import { getSkillById } from "./agents/skills.js";

export type ActionPolicyDecision = "allow" | "deny" | "requires_approval" | "audit_only";

export type ActionPolicyResult = {
  decision: ActionPolicyDecision;
  reason: string;
  matchedTerms: string[];
};

export type ActionPolicyInput = {
  route: "/agents/execute" | "/agents/skills/execute";
  message?: string;
  skillId?: string;
  advisor?: string;
  category?: string;
  context?: Record<string, unknown>;
};

const DENY_PATTERNS = [
  "exfiltrate",
  "leak secret",
  "reveal secret",
  "reveal token",
  "reveal password",
  "private key",
  "ignore previous instructions",
  "bypass policy",
  "override policy",
];

const APPROVAL_PATTERNS = [
  "unlock",
  "open gate",
  "grant access",
  "change password",
  "reset password",
  "share password",
  "send email",
  "text owner",
  "contact vendor",
  "dispatch vendor",
  "book ",
  "purchase",
  "pay ",
  "wire ",
  "sign contract",
  "approve contract",
];

const AUDIT_ONLY_PATTERNS = [
  "analyze",
  "review",
  "summarize",
  "triage",
  "plan",
  "maintenance",
  "vendor missed",
  "inspection",
];

function compactText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => compactText(item)).join(" ");
  }

  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .map((item) => compactText(item))
      .join(" ");
  }

  return "";
}

function actionText(input: ActionPolicyInput): string {
  const skill = input.skillId ? getSkillById(input.skillId) : undefined;
  const parts = [
    input.route,
    input.message,
    input.skillId,
    input.advisor,
    input.category,
    skill?.advisor,
    skill?.category,
    skill?.riskLevel,
    compactText(input.context),
  ];

  return parts.join(" ").toLowerCase();
}

function matchedTerms(text: string, patterns: string[]): string[] {
  return patterns.filter((pattern) => text.includes(pattern));
}

function isSensitiveAdvisor(input: ActionPolicyInput): boolean {
  const skill = input.skillId ? getSkillById(input.skillId) : undefined;
  const advisor = input.advisor ?? skill?.advisor ?? "";
  const category = input.category ?? skill?.category ?? "";

  return (
    advisor === "Security Advisor" ||
    advisor === "Compliance Advisor" ||
    category.includes("passwords/access/security") ||
    category.includes("contracts/risk/legal/privacy")
  );
}

export function evaluateActionPolicy(input: ActionPolicyInput): ActionPolicyResult {
  const text = actionText(input);
  const deniedTerms = matchedTerms(text, DENY_PATTERNS);

  if (deniedTerms.length > 0) {
    return {
      decision: "deny",
      reason: "Request matches a forbidden action category.",
      matchedTerms: deniedTerms,
    };
  }

  const approvalTerms = matchedTerms(text, APPROVAL_PATTERNS);

  if (approvalTerms.length > 0 || isSensitiveAdvisor(input)) {
    return {
      decision: "requires_approval",
      reason: "Request requires explicit human approval before execution.",
      matchedTerms: approvalTerms,
    };
  }

  const auditTerms = matchedTerms(text, AUDIT_ONLY_PATTERNS);

  if (auditTerms.length > 0) {
    return {
      decision: "audit_only",
      reason: "Request is safe for local dry-run execution and should be clearly audited.",
      matchedTerms: auditTerms,
    };
  }

  return {
    decision: "allow",
    reason: "Request is allowed for local dry-run execution.",
    matchedTerms: [],
  };
}
