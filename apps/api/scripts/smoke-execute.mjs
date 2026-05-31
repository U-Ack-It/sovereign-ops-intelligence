import http from "node:http";

const payload = JSON.stringify({
  message: "The pool maintenance vendor missed the appointment again.",
  context: {
    property: "Miami residence",
    urgency: "medium",
  },
});

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function postExecute() {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: "localhost",
        port: 3000,
        path: "/agents/execute",
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(payload),
        },
      },
      (response) => {
        let body = "";

        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => resolve({ statusCode: response.statusCode, body }));
      },
    );

    request.on("error", reject);
    request.write(payload);
    request.end();
  });
}

const response = await postExecute();

assert(response.statusCode === 200, `Expected HTTP 200, got ${response.statusCode}`);

const parsed = JSON.parse(response.body);

assert(parsed.route?.advisor, "Expected route.advisor");
assert(parsed.execution?.skillId, "Expected execution.skillId");
assert(parsed.execution?.summary, "Expected execution.summary");
assert(parsed.execution?.audit, "Expected execution.audit");
assert(
  parsed.execution.audit.decision.startsWith("dry_run_"),
  "Expected dry-run audit decision and no real side effects",
);

console.log("Smoke execute passed");
