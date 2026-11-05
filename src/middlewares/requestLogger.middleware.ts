import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";
import logger from "../utils/logger.utils.js";



const requestLogger = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  // Generate a unique ID for this request
  const requestId = randomUUID();
  const module = req.path.split("/")[2] || "other";

  // Add request ID to response headers
  res.setHeader("X-Request-ID", requestId);

  // Record request start time
  const startTime = process.hrtime.bigint();

  // Log incoming request
  logger.info("Incoming request", {
    requestId,
    method: req.method,
    path: req.originalUrl.split("?")[0],
    module,
  });

  // Prevent duplicate completion logs
  let logged = false;

  // Log when response is completed
  const logCompletion = (event: "finish" | "close") => {
    if (logged) return;

    logged = true;

    const duration =
      Number(process.hrtime.bigint() - startTime) / 1_000_000;

    if (event === "close" && !res.writableFinished) {
      logger.warn("Request connection closed before response completed", {
        requestId,
        method: req.method,
        path: req.path,
        module,
        status: res.statusCode,
        duration: `${duration.toFixed(2)}ms`,
      });

      return;
    }

    const status = res.statusCode;

    const logData = {
      requestId,
      method: req.method,
      path: req.path,
      module,
      status,
      duration: `${duration.toFixed(2)}ms`,
    };

    if (status >= 500) {
      logger.error("Request completed with server error", logData);
    } else if (status >= 400) {
      logger.warn("Request completed with client error", logData);
    } else {
      logger.info("Request completed", logData);
    }
  };

  res.once("finish", () => logCompletion("finish"));
  res.once("close", () => logCompletion("close"));

  next();
};

export default requestLogger;