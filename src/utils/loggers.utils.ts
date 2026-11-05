import pino from "pino";
import { pinoHttp } from "pino-http";

// General application logger
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",

  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers.set-cookie",
      "*.password",
      "*.otp",
      "*.otpCode",
      "*.token",
      "*.refreshToken",
      "*.accessToken",
    ],
    censor: "[REDACTED]",
  },
});

// HTTP request/response logger
export const httpLogger = pinoHttp({
  logger,

  serializers: {
    req(req) {
      return {
        method: req.method,
        url: req.url,
      };
    },
    res(res) {
      return {
        statusCode: res.statusCode,
      };
    },
  },

  customLogLevel(_req, res, err) {
    if (err || res.statusCode >= 500) {
      return "error";
    }

    if (res.statusCode >= 400) {
      return "warn";
    }

    return "info";
  },
});