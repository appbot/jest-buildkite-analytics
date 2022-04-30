# Jest Buildkite Analytics

This package collects data about your test suite's performance and reliability, and allows you to see trends and insights about your test suite over time ✨

## Installation

```shellscript
yarn add @appbot/jest-buildkite-analytics
```

Configure your API key:

set the environment variable `BUILDKITE_JEST_ANALYTICS_TOKEN` to your token. If you're running jest from a script, you can set it with:

```shell
export BUILDKITE_JEST_ANALYTICS_TOKEN="yourTokenValueHere"
```

We suggest loading the environment variable within your buildkite settings.

Tell jest to use the reporter. Set `reporters` in your `jest.config.js` (or which ever type of config you're using):

```javascript
{
  reporters: ["default", "jest-buildkite-analytics"];
}
```

Lastly, commit and push your changes to start analysing your tests:

```
$ git commit -m "Add Buildkite Test Analytics client"
$ git push
```

## Contributing

Bug reports and pull requests are welcome on GitHub at https://github.com/appbot/jest-buildkite-analytics.

## License

The gem is available as open source under the terms of the [MIT License](https://opensource.org/licenses/MIT).
