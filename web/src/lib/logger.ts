/**
 * Logger for CodeMore Web App
 *
 * Next.js compatible logger with:
 * - Automatic secret redaction
 * - Structured JSON output
 * - No worker threads (compatible with Next.js bundler)
 */

const isDevelopment = process.env.NODE_ENV !== "production";
const logLevel = process.env.LOG_LEVEL || (isDevelopment ? "debug" : "info");

// Log level priorities
const levels: Record<string, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

const currentLevel = levels[logLevel] || levels.info;

// Paths to automatically redact (secrets, tokens, etc.)
const sensitiveKeys = new Set([
  "accesstoken",
  "apikey",
  "secret",
  "password",
  "token",
  "authorization",
]);

function redact(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") return obj;
  if (typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.map(redact);
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (sensitiveKeys.has(key.toLowerCase())) {
      result[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      result[key] = redact(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

interface LogFn {
  (obj: object, msg?: string): void;
  (msg: string): void;
}

interface Logger {
  trace: LogFn;
  debug: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  fatal: LogFn;
  child: (bindings: Record<string, unknown>) => Logger;
}

function createLogFn(level: number, levelName: string, bindings: Record<string, unknown> = {}): LogFn {
  return (objOrMsg: object | string, msg?: string) => {
    if (level < currentLevel) return;

    const timestamp = new Date().toISOString();
    let logObj: Record<string, unknown>;

    if (typeof objOrMsg === "string") {
      logObj = {
        level,
        levelName,
        time: timestamp,
        service: "codemore-web",
        ...bindings,
        msg: objOrMsg,
      };
    } else {
      const redacted = redact(objOrMsg) as Record<string, unknown>;
      logObj = {
        level,
        levelName,
        time: timestamp,
        service: "codemore-web",
        ...bindings,
        ...redacted,
        msg: msg || "",
      };
    }

    const output = JSON.stringify(logObj);

    if (level >= levels.error) {
      console.error(output);
    } else if (level >= levels.warn) {
      console.warn(output);
    } else {
      console.log(output);
    }
  };
}

function createLogger(bindings: Record<string, unknown> = {}): Logger {
  return {
    trace: createLogFn(levels.trace, "trace", bindings),
    debug: createLogFn(levels.debug, "debug", bindings),
    info: createLogFn(levels.info, "info", bindings),
    warn: createLogFn(levels.warn, "warn", bindings),
    error: createLogFn(levels.error, "error", bindings),
    fatal: createLogFn(levels.fatal, "fatal", bindings),
    child: (childBindings: Record<string, unknown>) =>
      createLogger({ ...bindings, ...childBindings }),
  };
}

// Create base logger
const logger = createLogger();

// Named export for modules expecting { logger } import
export { logger };

/**
 * Create a child logger for a specific module
 */
export function createModuleLogger(module: string): Logger {
  return logger.child({ module });
}

/**
 * Safely extract error info without leaking sensitive data
 */
export function sanitizeError(error: unknown): { message: string; name: string; code?: string } {
  if (error instanceof Error) {
    const sanitized: { message: string; name: string; code?: string } = {
      message: error.message,
      name: error.name,
    };

    // Include error code if present
    if ("code" in error && typeof (error as { code: unknown }).code === "string") {
      sanitized.code = (error as { code: string }).code;
    }

    return sanitized;
  }

  if (typeof error === "string") {
    return { message: error, name: "Error" };
  }

  return { message: "Unknown error", name: "Error" };
}

export default logger;
