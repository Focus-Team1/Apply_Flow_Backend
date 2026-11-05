import winston, { format } from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import { mkdirSync } from "node:fs";

mkdirSync("logs", { recursive: true });

// Define colors for log levels
winston.addColors({
  error: "red",
  warn: "yellow",
  info: "green",
  debug: "blue",
});

// Format shared by terminal and files
const createLogFormat = () =>
  format.combine(
    format.timestamp({
      format: "YYYY-MM-DD HH:mm:ss",
    }),
    format.errors({ stack: true }),
    format.splat(),

    format.printf((info) => {
      const {
        timestamp,
        level,
        message,
        stack,
        ...metadata
      } = info;

      const extra =
        Object.keys(metadata).length > 0
          ? JSON.stringify(metadata)
          : "";

      return (
        `${timestamp} [${String(level).toUpperCase()}] ${message}` +
        `${extra ? ` ${extra}` : ""}` +
        `${stack ? `\n${stack}` : ""}\n\n`
      );
    }),
  );

// Create Winston logger
const logger = winston.createLogger({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",

  defaultMeta: {
    service: "apply-flow-api",
  },

  transports: [
    // Terminal output
    new winston.transports.Console({
      format: format.combine(
        createLogFormat(),
        format.colorize({ all: true }),
      ),
    }),

    // All application logs
    new DailyRotateFile({
      filename: "logs/%DATE%-application.log",
      datePattern: "YYYY-MM-DD",
      maxFiles: "30d",
      zippedArchive: true,
      format: createLogFormat(),
    }),

    // Error logs only
    new DailyRotateFile({
      filename: "logs/%DATE%-error.log",
      level: "error",
      datePattern: "YYYY-MM-DD",
      maxFiles: "30d",
      zippedArchive: true,
      format: createLogFormat(),
    }),
  ],
});

export default logger;