import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const START_TIMEOUT_MS = 5_000;

function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: false,
      env: options.env ?? process.env,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

async function smokeStart() {
  const child = spawn(process.execPath, ["dist/server.js"], {
    shell: false,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: "0",
      SOVEREIGN_ADMIN_API_KEY: "a-long-safe-fake-admin-key-12345",
    },
  });

  let output = "";
  let exited = false;

  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });

  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  child.on("close", () => {
    exited = true;
  });

  const deadline = Date.now() + START_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (output.includes("API server listening")) {
      child.kill("SIGTERM");
      await delay(100);
      return;
    }

    if (exited) {
      throw new Error(`Production start exited early.\n${output.trim()}`);
    }

    await delay(100);
  }

  child.kill("SIGTERM");
  throw new Error(`Production start did not report readiness within ${START_TIMEOUT_MS}ms.\n${output.trim()}`);
}

const build = await runCommand("npm", ["run", "build"]);

if (build.code !== 0) {
  console.error(build.stdout);
  console.error(build.stderr);
  process.exit(1);
}

try {
  await smokeStart();
  console.log("Production start smoke passed.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
