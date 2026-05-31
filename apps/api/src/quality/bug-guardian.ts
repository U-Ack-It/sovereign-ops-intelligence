export type QualityRiskLevel = "low" | "medium" | "high";

export type QualityGateResult = {
  riskLevel: QualityRiskLevel;
  requiredChecks: string[];
  reasons: string[];
};

export type BugGuardianPlan = QualityGateResult & {
  changedFiles: string[];
  runFullVerify: boolean;
};

const CHECKS = {
  python: "python scaffold tests",
  typecheck: "npm run typecheck",
  agents: "npm run test:agents",
  smoke: "npm run smoke",
};

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function maxRisk(left: QualityRiskLevel, right: QualityRiskLevel): QualityRiskLevel {
  const rank: Record<QualityRiskLevel, number> = {
    low: 1,
    medium: 2,
    high: 3,
  };

  return rank[right] > rank[left] ? right : left;
}

function isPackageOrConfig(path: string): boolean {
  return (
    path === "apps/api/package.json" ||
    path === "apps/api/package-lock.json" ||
    path.endsWith("tsconfig.json") ||
    path.endsWith("tsconfig.build.json") ||
    path.endsWith("tsconfig.test.json") ||
    path.startsWith("apps/api/scripts/") ||
    path.startsWith("scripts/")
  );
}

function isDocsOnly(path: string): boolean {
  return path.startsWith("docs/") || path.endsWith(".md");
}

function isImportantUnknown(path: string): boolean {
  if (isDocsOnly(path)) {
    return false;
  }

  return (
    path.endsWith(".py") ||
    path.endsWith(".ts") ||
    path.endsWith(".mjs") ||
    path.endsWith(".json") ||
    path.startsWith("apps/") ||
    path.startsWith("sovereign/") ||
    path.startsWith("tests/") ||
    path === "app.py"
  );
}

export function classifyChangedFiles(changedFiles: string[]): QualityGateResult {
  let riskLevel: QualityRiskLevel = "low";
  const requiredChecks = [CHECKS.python, CHECKS.typecheck, CHECKS.agents, CHECKS.smoke];
  const reasons: string[] = [];

  for (const path of changedFiles) {
    if (path.startsWith("apps/api/src/agents/")) {
      riskLevel = maxRisk(riskLevel, "high");
      reasons.push(`${path}: agent code changed; agent tests and smoke must pass`);
      continue;
    }

    if (isPackageOrConfig(path)) {
      riskLevel = maxRisk(riskLevel, "medium");
      reasons.push(`${path}: package/config/script changed; typecheck and smoke must pass`);
      continue;
    }

    if (path.includes(".test.") || path.startsWith("tests/")) {
      riskLevel = maxRisk(riskLevel, "medium");
      reasons.push(`${path}: tests changed; related test command must pass`);
      continue;
    }

    if (isDocsOnly(path)) {
      reasons.push(`${path}: documentation-only change`);
      continue;
    }

    if (isImportantUnknown(path)) {
      riskLevel = maxRisk(riskLevel, "medium");
      reasons.push(`${path}: important unclassified file changed`);
    }
  }

  if (changedFiles.length === 0) {
    reasons.push("No changed files detected; full verification still allowed");
  }

  return {
    riskLevel,
    requiredChecks: unique(requiredChecks),
    reasons,
  };
}

export function createBugGuardianPlan(changedFiles: string[]): BugGuardianPlan {
  const classification = classifyChangedFiles(changedFiles);

  return {
    ...classification,
    changedFiles,
    runFullVerify: true,
  };
}
