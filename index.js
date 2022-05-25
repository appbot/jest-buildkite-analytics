const { relative } = require("path");
const os = require("os");
const { randomUUID } = require("crypto");
const BuildkiteSocket = require("./buildkite_socket");

const clean = s => (s ? s.replace(/\x1b\[.*?m/g, "").trim() : null);

const states = {
  passed: "passed",
  failed: "failed",
  pending: "pending",
  todo: "skipped",
};

const result = state => states[state] || "skipped";

const toStat = (test, path, start, end) => {
  path = "./" + relative(process.cwd(), path);

  const stat = {
    id: randomUUID(),
    scope: test.ancestorTitles.join(" ") || "root",
    name: test.title,
    identifier: test.fullName,
    location: test.location
      ? `${path}:${test.location.line}:${test.location.column}`
      : path,
    file_name: path,
    result: result(test.status),
    history: {
      section: "top",
      start_at: start,
      end_at: end,
      duration: test.duration / 1000,
      detail: {},
      children: [],
    },
    failure_reason: null,
    failure_expanded: [],
  };

  if (stat.result === "failed") {
    const reasons = [];
    // there's only ever one, but both ends use an array. so :shrug:
    for (let i = 0; i < test.failureDetails.length; i++) {
      const detail = {
        message: clean(
          test.failureDetails[i] && test.failureDetails[i].message
        ),
        stack:
          clean(test.failureDetails[i].stack || test.failureMessages[i]) ||
          "Unknown error",
      };
      let [pre, ...backtrace] = detail.stack.split(/\n\s*at\s+/g);
      const [reason, ...expanded] = (detail.message || pre).split("\n");
      if (backtrace) {
        backtrace = backtrace.map(b => "  at " + b);
      }
      reasons.push(reason);
      stat.failure_expanded.push({ expanded, backtrace });
    }
    stat.failure_reason = reasons.join("\n");
  }

  return stat;
};

const fileResult = result => {
  // the timings are very approximate
  let { start, end } = result.perfStats;

  return result.testResults.map(t =>
    toStat(t, result.testFilePath, start, end)
  );
};

const run_env = {
  ci: "buildkite",
  key: process.env.BUILDKITE_BUILD_ID,
  number: process.env.BUILDKITE_BUILD_NUMBER,
  job_id: process.env.BUILDKITE_JOB_ID,
  branch: process.env.BUILDKITE_BRANCH,
  commit_sha: process.env.BUILDKITE_COMMIT,
  message: process.env.BUILDKITE_MESSAGE,
  url: process.env.BUILDKITE_BUILD_URL,
};

class CustomReporter {
  constructor() {
    if (
      !process.env.BUILDKITE_BUILD_ID ||
      !process.env.BUILDKITE_JEST_ANALYTICS_TOKEN
    ) {
      console.log("Not sending to buildkite, missing required env vars");
      return;
    }
    this.canSend = true;
    this.socket = new BuildkiteSocket(run_env);
  }

  sendToBuildkite(results) {
    return this.socket.message({ action: "record_results", results });
  }

  connect() {
    return this.socket.connect();
  }

  connectToSocket() {
    return this.socket.connectToSocket();
  }

  onTestFileResult(_test, results) {
    if (!this.canSend) return;

    return this.sendToBuildkite(fileResult(results));
  }
  async onRunStart() {
    if (!this.canSend) return;

    await this.connect().catch(e =>
      console.log("Not sending to buildkite analytics", e)
    );
  }

  async onRunComplete(_testContexts, results) {
    this.socket.end(results.numTotalTests);
  }
}

module.exports = CustomReporter;
