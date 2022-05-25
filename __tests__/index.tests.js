process.env.BUILDKITE_BUILD_ID = "https://buildkite.com/random/repo/31580";
process.env.BUILDKITE_JEST_ANALYTICS_TOKEN = "fake_token";

it("runs", () => expect(1).toEqual(1));
