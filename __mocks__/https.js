const https = jest.createMockFromModule("https");
const EventEmitter = require("events");
const { nextTick } = require("process");

const noOp = () => {};
const error = {
  phase: null,
  message: null,
  status: 200,
};

const setFailure = (phase, message, status = 200) => {
  error.phase = phase;
  error.message = message;
  error.stats = status;
};
const reset = () => {
  error.phase = null;
  error.message = null;
  error.status = 200;
};

const request = (options, callback) => {
  const em = new EventEmitter();

  if (error.phase == "request") {
    em.end = () => em.emit("error", new Error(error.message));
  } else {
    em.end = () => {
      const res = new EventEmitter();
      res.status = error.status;
      res.setEncoding = noOp;
      if (error.phase == "response") {
      }
      nextTick(callback(res));
    };
  }
  return em;
};

module.exports = {
  ...https,
  request,
  setFailure,
  reset,
};
