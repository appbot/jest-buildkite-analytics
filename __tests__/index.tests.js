process.env.BUILDKITE_BUILD_ID = "https://buildkite.com/random/repo/31580";
process.env.BUILDKITE_JEST_ANALYTICS_TOKEN = "fake_token";

const CustomReporter = require("..");
const https = require("https");

jest.mock("https");

afterEach(https.reset);

describe("connection", () => {
  describe("connection failure", () => {
    describe("network failure", () => {
      beforeEach(() => https.setFailure("request", "getaddrinfo ENOTFOUND"));

      it("reports the connection failure", async () => {
        const reporter = new CustomReporter();
        await expect(reporter.connect()).rejects.toThrow(
          "Error connecting to Buildkite: getaddrinfo ENOTFOUND"
        );
      });
    });
    describe("settings error", () => {
      // const errorMessage =
      //   "jest-buildkite-analytics could not establish an initial connection with Buildkite. You may be missing some data for this test suite, please contact support.";
      const errorMessage =
        "Buildkite Test Analytics: Invalid Suite API key. Please double check your Suite API key.";
      beforeEach(() => https.setFailure(null, null, 401));

      it("reports the connection failure", async () => {
        const reporter = new CustomReporter();
        await expect(reporter.connect()).rejects.toThrow(errorMessage);
      });
    });
  });

  // it.only("dosn't break", async () => {
  //   const reporter = new CustomReporter();
  //   await expect(reporter.connect()).resolves.toBeUndefined();
  //   await reporter.disconnect();
  // });
});
