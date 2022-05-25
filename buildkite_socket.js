const https = require("https");
const WebSocketClient = require("websocket/lib/WebSocketClient");

const Authorization = `Token token="${process.env.BUILDKITE_JEST_ANALYTICS_TOKEN}"`;

const connectedPromise = {
  callbacks: {
    resolve: () => {},
    reject: err => {},
  },
  done: err => {
    if (connectedPromise.complete) return err && console.log(err.message);
    connectedPromise.complete = true;

    if (err) connectedPromise.callbacks.reject(err);

    console.log("Connection to buildkite established");

    return connectedPromise.callbacks.resolve();
  },
};

module.exports = class BuildkiteSocket {
  constructor(run_env) {
    this.run_env = run_env;
  }

  connect() {
    const body = JSON.stringify({ format: "websocket", run_env: this.run_env });

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
          let responseData = "";

          response.setEncoding("utf8");

          response
            .on("data", data => (responseData += data))
            .on("end", async () => {
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
            })
            .on("error", err => {
              e.message = "Error connecting to Buildkite: " + e.message;
              done(e);
            });

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

  message(data = null) {
    if (!this._connected) return;
    this.send("message", data ? { data: JSON.stringify(data) } : {});
  }

  handleMessage(message) {
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

  connectToSocket(handler) {
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

  send(command, message = {}) {
    if (!this.socket) return;

    return new Promise((resolve, reject) => {
      const str = JSON.stringify({
        ...message,
        command,
        identifier: this.channel,
      });
      this.socket.send(str, err => resolve(err));
    });
  }

  async end(examples_count) {
    if (!this.socket) return;

    await this.message({ action: "end_of_transmission", examples_count });

    this.socket.close();
    this.socket = null;
  }
};
