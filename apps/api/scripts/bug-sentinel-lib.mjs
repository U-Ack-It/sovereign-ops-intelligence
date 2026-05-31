import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import path from "node:path";

export const BUG_SENTINEL_CHECKS = [
  {
    name: "npm run typecheck",
    command: "npm",
    args: ["run", "typecheck"],
  },
  {
    name: "npm run test:agents",
    command: "npm",
    args: ["run", "test:agents"],
  },
  {
    name: "npm run smoke",
    command: "npm",
    args: ["run", "smoke"],
  },
];

export function runCommand(check, options = {}) {
  const startedAt = performance.now();

  return new Promise((resolve) => {
    const child = spawn(check.command, check.args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: false,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      const durationMs = Math.round(performance.now() - startedAt);

      resolve({
        name: check.name,
        command: [check.command, ...check.args].join(" "),
        exitCode: 1,
        stdout,
        stderr: `${stderr}${error.message}`,
        durationMs,
        passed: false,
      });
    });

    child.on("close", (code) => {
      const durationMs = Math.round(performance.now() - startedAt);
      const exitCode = code ?? 1;

      resolve({
        name: check.name,
        command: [check.command, ...check.args].join(" "),
        exitCode,
        stdout,
        stderr,
        durationMs,
        passed: exitCode === 0,
      });
    });
  });
}

export function buildBugSentinelReport(results, options = {}) {
  const firstFailure = results.find((result) => !result.passed) ?? null;
  const passed = firstFailure === null;
  const createdAt = options.createdAt ?? new Date().toISOString();

  return {
    gate: "bug-sentinel",
    service: "sovereign-ops-api",
    createdAt,
    passed,
    firstFailingCommand: firstFailure
      ? {
          name: firstFailure.name,
          command: firstFailure.command,
          exitCode: firstFailure.exitCode,
        }
      : null,
    results,
  };
}

export function formatMarkdownReport(report) {
  const lines = [
    "# Bug Sentinel Report",
    "",
    `- Service: \`${report.service}\``,
    `- Created: \`${report.createdAt}\``,
    `- Status: ${report.passed ? "PASS" : "FAIL"}`,
  ];

  if (report.firstFailingCommand) {
    lines.push(
      `- First failing command: \`${report.firstFailingCommand.command}\``,
      `- First failing exit code: \`${report.firstFailingCommand.exitCode}\``,
    );
  }

  lines.push("", "## Checks", "");

  for (const result of report.results) {
    lines.push(
      `### ${result.passed ? "PASS" : "FAIL"} ${result.name}`,
      "",
      `- Command: \`${result.command}\``,
      `- Exit code: \`${result.exitCode}\``,
      `- Duration: \`${result.durationMs}ms\``,
      "",
      "<details>",
      "<summary>stdout</summary>",
      "",
      "```text",
      result.stdout.trim() || "(empty)",
      "```",
      "",
      "</details>",
      "",
      "<details>",
      "<summary>stderr</summary>",
      "",
      "```text",
      result.stderr.trim() || "(empty)",
      "```",
      "",
      "</details>",
      "",
    );
  }

  if (!report.passed) {
    lines.push(
      "## Bug Fix Guidance",
      "",
      "1. Start with the first failing command.",
      "2. Read stderr first, then stdout.",
      "3. Reproduce the failing command locally.",
      "4. Make the smallest safe fix.",
      "5. Rerun `npm run bug:sentinel`.",
      "",
    );
  }

  return `${lines.join("\n")}\n`;
}

export async function writeBugSentinelReports(report, artifactDir) {
  await mkdir(artifactDir, { recursive: true });

  const jsonPath = path.join(artifactDir, "latest.json");
  const markdownPath = path.join(artifactDir, "latest.md");

  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, formatMarkdownReport(report), "utf8");

  return {
    jsonPath,
    markdownPath,
  };
}
