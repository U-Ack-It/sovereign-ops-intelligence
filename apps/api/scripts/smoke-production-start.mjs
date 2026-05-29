import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";

const START_TIMEOUT_MS = 5_000;
const SHUTDOWN_TIMEOUT_MS = 5_000;

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

function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();

    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;

      probe.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });

    probe.on("error", reject);
  });
}

function getHealth(port) {
  return new Promise((resolve) => {
    const request = http.get(
      {
        hostname: "127.0.0.1",
        port,
        path: "/health",
        timeout: 1_000,
      },
      (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode === 200));
      },
    );

    request.on("error", () => resolve(false));
    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function waitForHealth(port, getOutput, hasExited) {
  const deadline = Date.now() + START_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (await getHealth(port)) {
      return;
    }

    if (hasExited()) {
      throw new Error(`Production start exited before /health was ready.\n${getOutput().trim()}`);
    }

    await delay(100);
  }

  throw new Error(`Production /health did not become ready within ${START_TIMEOUT_MS}ms.\n${getOutput().trim()}`);
}

function waitForExit(child) {
  return new Promise((resolve) => {
    child.on("close", (code, signal) => {
      resolve({ code, signal });
    });
  });
}

async function smokeStart() {
  const port = await findFreePort();
  const child = spawn(process.execPath, ["dist/server.js"], {
    shell: false,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
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

  try {
    await waitForHealth(port, () => output, () => exited);
    const exitPromise = waitForExit(child);
    child.kill("SIGTERM");

    const shutdownResult = await Promise.race([
      exitPromise,
      delay(SHUTDOWN_TIMEOUT_MS).then(() => null),
    ]);

    if (shutdownResult === null) {
      child.kill("SIGKILL");
      throw new Error(`Production server did not exit after SIGTERM.\n${output.trim()}`);
    }

    if (shutdownResult.code !== 0) {
      throw new Error(
        `Production server exited with ${shutdownResult.code ?? shutdownResult.signal} after SIGTERM.\n${output.trim()}`,
      );
    }
  } catch (error) {
    if (!exited) {
      child.kill("SIGTERM");
    }

    throw error;
  }
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
