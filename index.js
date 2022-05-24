const { relative } = require("path");
const https = require("https");
const os = require("os");
const { randomUUID } = require("crypto");
const WebSocketClient = require("websocket/lib/WebSocketClient");

const Authorization = `Token token="${process.env.BUILDKITE_JEST_ANALYTICS_TOKEN}"`;

const clean = s => (s ? s.replace(/\x1b\[.*?m/g, "").trim() : null);
const timeOffset = Date.now() / 1000 - os.uptime();

const connectedPromise = {
  callbacks: {
    resolve: () => {},
    reject: err => {},
  },
  done: err => {
    if (connectedPromise.complete) return console.log(err.message);
    connectedPromise.complete = true;

    if (err) connectedPromise.callbacks.reject(err);

    console.log("Connection to buildkite established");

    return connectedPromise.callbacks.resolve();
  },
};

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
  }

  sendToBuildkite(results) {
    return this.send("message", {
      data: JSON.stringify({ action: "record_results", results }),
    });
  }

  connect() {
    let responseData = "";
    const body = JSON.stringify({ format: "websocket", run_env });

    return new Promise((resolve, reject) => {
      let responded = false;
      const done = err => {
        if (responded) return;

        responded = true;
        if (err) return reject(err);
        resolve();
      };
      const request = https.request(
        {
          hostname: "analytics-api.buildkite.com",
          path: "/v1/uploads",
          method: "POST",
          headers: {
            Authorization,
            "Content-Type": "application/json",
          },
        },
        response => {
          const { statusCode } = response;

          response.setEncoding("utf8");

          response.on("data", data => (responseData += data));

          response.on("end", async () => {
            const result = JSON.parse(responseData);

            this.socketURL = result.cable;
            this.channel = result.channel;
            try {
              if (statusCode == 200) {
                await this.connectToSocket();
                this._connected = true;
                return done();
              }
              done(new Error("Error connecting to Buildkite"));
            } catch (e) {
              return done(e);
            }
          });
          response.on("error", err => {
            e.message = "Error connecting to Buildkite: " + e.message;
            done(e);
          });

          let responseData = "";
          if (statusCode == 401) {
            return done(
              new Error(
                "Buildkite Test Analytics: Invalid Suite API key. Please double check your Suite API key."
              )
            );
          }
          if (statusCode != 200) {
            return done(
              new Error(
                "jest-buildkite-analytics could not establish an initial connection with Buildkite. " +
                  "You may be missing some data for this test suite, please contact support."
              )
            );
          }
        }
      );

      request
        .on("error", err => {
          err.message = "Error connecting to Buildkite: " + err.message;
          done(err);
        })
        .end(body);
    });
  }

  async disconnect() {
    if (!this.socket) return;
    this.socket.close();
    this.socket = null;
  }

  send(command, message = {}) {
    if (!this.socket) return;
    if (command == "message" && !this._connected) return;

    return new Promise((resolve, reject) => {
      const str = JSON.stringify({
        ...message,
        command,
        identifier: this.channel,
      });
      this.socket.send(str, err => resolve(err));
    });
  }

  handleMessage(message) {
    if (message.type !== "ping") {
      console.log("RECEIVED", message);
    }
    switch (message.type) {
      case "ping":
        return;
      case "welcome":
        this.send("subscribe");
        return;
      case "confirm_subscription":
        if (message.identifier != this.channel) {
          return connectedPromise.done(
            new Error(
              `Received unexpected subscription confirmation from Buildkite: ${message.identifier}`
            )
          );
        }
        this.subscribed = true;
        return connectedPromise.done();

      case "reject_subscription":
        return connectedPromise.done(
          new Error("Connection refused by Buildkite. Web socket rejected.")
        );

      default:
        if (!message.message || !message.message.confirm)
          throw new Error(`Unknown message: ${message.type}`);
    }
  }

  connectToSocket() {
    return new Promise((resolve, reject) => {
      // we resolve only once the subscription is complete
      connectedPromise.callbacks = { resolve, reject };

      const url = new URL(this.socketURL);
      const wsc = new WebSocketClient({ closeTimeout: 1000 });
      wsc.on("connect", connection => {
        this.socket = connection;
        connection.on("message", message => {
          const data = JSON.parse(message.utf8Data);
          this.handleMessage(data);
        });
        connection.on("close", (code, description) => {
          this.subscribed = false;
          connectedPromise.done(
            new Error(`Connection to buildkite closed: ${code}: ${description}`)
          );
        });
        connection.on("error", err => {
          this.subscribed = false;
          connectedPromise.done(err);
        });
      });

      wsc.connect(this.socketURL, null, `https://${url.hostname}`, {
        Authorization,
      });
    });
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
    // send end
    await new Promise(r => setTimeout(r, 20000));
    await this.send("message", {
      data: JSON.stringify({
        action: "end_of_transmission",
        examples_count: results.numTotalTests,
      }),
    });
    return this.disconnect();
  }
}

module.exports = CustomReporter;
