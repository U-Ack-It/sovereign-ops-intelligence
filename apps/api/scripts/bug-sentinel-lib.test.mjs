import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBugSentinelReport,
  formatMarkdownReport,
} from "./bug-sentinel-lib.mjs";

test("buildBugSentinelReport identifies a fully green run", () => {
  const report = buildBugSentinelReport(
    [
      {
        name: "npm run typecheck",
        command: "npm run typecheck",
        exitCode: 0,
        stdout: "ok",
        stderr: "",
        durationMs: 10,
        passed: true,
      },
    ],
    { createdAt: "2026-05-27T00:00:00.000Z" },
  );

  assert.equal(report.passed, true);
  assert.equal(report.firstFailingCommand, null);
  assert.equal(report.results.length, 1);
});

test("buildBugSentinelReport identifies the first failing command", () => {
  const report = buildBugSentinelReport(
    [
      {
        name: "npm run typecheck",
        command: "npm run typecheck",
        exitCode: 0,
        stdout: "",
        stderr: "",
        durationMs: 10,
        passed: true,
      },
      {
        name: "npm run test:agents",
        command: "npm run test:agents",
        exitCode: 1,
        stdout: "failed tests",
        stderr: "stack",
        durationMs: 20,
        passed: false,
      },
    ],
    { createdAt: "2026-05-27T00:00:00.000Z" },
  );

  assert.equal(report.passed, false);
  assert.deepEqual(report.firstFailingCommand, {
    name: "npm run test:agents",
    command: "npm run test:agents",
    exitCode: 1,
  });
});

test("formatMarkdownReport includes check evidence and fix guidance on failure", () => {
  const report = buildBugSentinelReport(
    [
      {
        name: "npm run smoke",
        command: "npm run smoke",
        exitCode: 1,
        stdout: "stdout evidence",
        stderr: "stderr evidence",
        durationMs: 30,
        passed: false,
      },
    ],
    { createdAt: "2026-05-27T00:00:00.000Z" },
  );

  const markdown = formatMarkdownReport(report);

  assert.match(markdown, /Status: FAIL/);
  assert.match(markdown, /First failing command: `npm run smoke`/);
  assert.match(markdown, /stdout evidence/);
  assert.match(markdown, /stderr evidence/);
  assert.match(markdown, /Bug Fix Guidance/);
});
