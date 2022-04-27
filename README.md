# Jest Buildkite Analytics

This package collects data about your test suite's performance and reliability, and allows you to see trends and insights about your test suite over time ✨

## Installation

```shellscript
yarn add @appbot/jest-buildkite-analytics
```

Configure your API key - in your `jest.config.js` or where ever you have your jest config

```javascript
{
  reporters: ["default", ["jest-buildkite-analytics", { token: "......" }]];
}
```

We suggest you load your token from an environment variable, and store it outside of your codebase.

```javascript
{
  reporters: [
    "default",
    [
      "jest-buildkite-analytics",
      { token: process.env.BUILDKITE_TEST_ANALYTICS_TOKEN },
    ],
  ];
}
```

Lastly, commit and push your changes to start analysing your tests:

```
$ git commit -m "Add Buildkite Test Analytics client"
$ git push
```

## Contributing

Bug reports and pull requests are welcome on GitHub at .

## License

The gem is available as open source under the terms of the [MIT License](https://opensource.org/licenses/MIT).
