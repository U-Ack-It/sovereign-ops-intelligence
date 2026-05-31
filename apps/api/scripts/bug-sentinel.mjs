#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BUG_SENTINEL_CHECKS,
  buildBugSentinelReport,
  runCommand,
  writeBugSentinelReports,
} from "./bug-sentinel-lib.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(scriptDir, "..");
const artifactDir = path.join(apiRoot, ".artifacts", "bug-sentinel");

const results = [];

for (const check of BUG_SENTINEL_CHECKS) {
  console.log(`Running ${check.name}`);
  const result = await runCommand(check, { cwd: apiRoot });
  results.push(result);

  if (result.passed) {
    console.log(`PASS ${check.name} (${result.durationMs}ms)`);
  } else {
    console.error(`FAIL ${check.name} (${result.durationMs}ms, exit ${result.exitCode})`);
    break;
  }
}

const report = buildBugSentinelReport(results);
const paths = await writeBugSentinelReports(report, artifactDir);

console.log(`Bug Sentinel JSON report: ${paths.jsonPath}`);
console.log(`Bug Sentinel Markdown report: ${paths.markdownPath}`);

if (report.firstFailingCommand) {
  console.error(`First failing command: ${report.firstFailingCommand.command}`);
}

process.exit(report.passed ? 0 : 1);
