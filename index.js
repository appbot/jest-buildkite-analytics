const https = require("https");
const { randomUUID } = require("crypto");

const clean = s => (s ? s.replace(/\x1b\[.*?m/g, "").trim() : null);

const toStat = (test, path, start) => {
  const stat = {
    id: randomUUID(),
    scope: test.ancestorTitles.join(" ") || "root",
    name: test.title,
    identifier: test.fullName,
    location: test.location
      ? `${path}:${test.location.line}:${test.location.column}`
      : null,
    result: test.status,
    history: {
      section: "top",
      start_at: start,
      end_at: start + test.duration / 1000,
      duration: test.duration / 1000,
      detail: {},
      children: [],
    },
    failure_reason: null,
    failure_expanded: [],
  };

  // result should be ["passed", "pending", "failed", "todo"]
  if (stat.result === "failed") {
    stat.failure_reason = [];
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
      const [pre, ...backtrace] = detail.stack.split(/\n\s*at\s+/g);
      const [reason, ...expanded] = (detail.message || pre).split("\n");

      stat.failure_reason.push(reason);
      stat.failure_expanded.push({ expanded, backtrace });
    }
  }

  return stat;
};

const fileResult = result => {
  // the timings are very approximate
  let start = result.perfStats.start / 1000; // to seconds

  return result.testResults.map(t => {
    const s = toStat(t, result.testFilePath, start);
    start = s.history.end_at;
    return s;
  });
};

const sendToBuildkite = results => {
  return new Promise(resolve => {
    let resolved = false;
    const oneResolve = () => {
      if (resolved) return;
      resolved = true;
      resolve();
    };

    const body = JSON.stringify({
      format: "json",
      run_env: {
        CI: "buildkite",
        key: process.env.BUILDKITE_BUILD_ID,
        number: process.env.BUILDKITE_BUILD_NUMBER,
        job_id: process.env.BUILDKITE_JOB_ID,
        branch: process.env.BUILDKITE_BRANCH,
        commit_sha: process.env.BUILDKITE_COMMIT,
        message: process.env.BUILDKITE_MESSAGE,
        url: process.env.BUILDKITE_BUILD_URL,
      },
      data: results,
    });
    const request = https.request(
      {
        hostname: "analytics-api.buildkite.com",
        path: "/v1/uploads",
        method: "POST",
        headers: {
          Authorization: `Token token="${process.env.BUILDKITE_JEST_ANALYTICS_TOKEN}"`,
          "Content-Type": "application/json",
          "Content-Length": body.length,
        },
      },
      res => {
        res.on("end", oneResolve);
        res.on("error", oneResolve);
      }
    );

    request.write(body);
    request.end();
  });
};

class CustomReporter {
  constructor() {}

  onRunComplete(_testContexts, results) {
    if (
      !process.env.BUILDKITE_BUILD_ID ||
      !process.env.BUILDKITE_JEST_ANALYTICS_TOKEN
    )
      return;
    const allStats = results.testResults.flatMap(fileResult);
    return sendToBuildkite(allStats);
  }
}

module.exports = CustomReporter;
