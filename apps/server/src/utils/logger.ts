import { Axiom } from "@axiomhq/js";
import type { Transport } from "@axiomhq/logging";
import { AxiomJSTransport, ConsoleTransport, Logger } from "@axiomhq/logging";

const REDACTED_SENSITIVE_VALUE = "[REDACTED]";
const SENSITIVE_PROPERTY_FRAGMENTS = [
  "password",
  "passphrase",
  "passcode",
  "passwd",
  "pwd",
  "email",
  "authorization",
  "cookie",
  "apikey",
  "token",
  "secret",
  "credential",
  "otp",
  "totp",
  "twofactor",
  "2fa",
  "mfa",
  "verification",
  "recovery",
  "backup",
  "authenticator",
  "privatekey",
  "p256dh",
  "csrf",
  "session",
  "pin",
] as const;
const SENSITIVE_PROPERTY_NAMES = new Set(["auth", "code"]);
const SENSITIVE_TEXT_PROPERTIES = [...SENSITIVE_PROPERTY_FRAGMENTS, ...SENSITIVE_PROPERTY_NAMES].join("|");
const SENSITIVE_TEXT_PATTERN = new RegExp(
  `((?:["']?(?:${SENSITIVE_TEXT_PROPERTIES})["']?)\\s*[:=]\\s*)(?:"(?:\\\\.|[^"])*"|'(?:\\\\.|[^'])*'|[^,\\s}\\]&]+)`,
  "gi",
);
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

function isSensitiveProperty(key: string): boolean {
  const normalizedKey = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return SENSITIVE_PROPERTY_NAMES.has(normalizedKey) || SENSITIVE_PROPERTY_FRAGMENTS.some((fragment) => normalizedKey.includes(fragment));
}

function redactSensitiveText(value: string): string {
  return value
    .replace(SENSITIVE_TEXT_PATTERN, (_match, prefix: string) => `${prefix}${REDACTED_SENSITIVE_VALUE}`)
    .replace(EMAIL_PATTERN, REDACTED_SENSITIVE_VALUE);
}

function redactSensitiveData(value: unknown, seen = new WeakMap<object, unknown>()): unknown {
  if (typeof value === "string") return redactSensitiveText(value);
  if (value === null || typeof value !== "object") return value;

  if (seen.has(value)) return seen.get(value);

  if (value instanceof Error) {
    const error = value as Error & { cause?: unknown };
    const redacted: Record<string, unknown> = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
    seen.set(value, redacted);

    if (error.cause !== undefined) redacted.cause = redactSensitiveData(error.cause, seen);

    for (const [key, nestedValue] of Object.entries(error)) {
      redacted[key] = isSensitiveProperty(key) ? REDACTED_SENSITIVE_VALUE : redactSensitiveData(nestedValue, seen);
    }

    return redacted;
  }

  if (Array.isArray(value)) {
    const redacted: unknown[] = [];
    seen.set(value, redacted);
    redacted.push(...value.map((item) => redactSensitiveData(item, seen)));
    return redacted;
  }

  const redacted: Record<string, unknown> = {};
  seen.set(value, redacted);

  for (const [key, nestedValue] of Object.entries(value)) {
    redacted[key] = isSensitiveProperty(key) ? REDACTED_SENSITIVE_VALUE : redactSensitiveData(nestedValue, seen);
  }

  return redacted;
}

function redactLogArguments<T extends readonly unknown[]>(argumentsToRedact: T): T {
  return argumentsToRedact.map((argument) => redactSensitiveData(argument)) as unknown as T;
}

function serializeError(err: unknown): { name: string; message: string; stack?: string; cause?: unknown } {
  if (!(err instanceof Error)) return { name: "UnknownError", message: String(err) };

  const errorWithCause = err as Error & { cause?: unknown };
  const serialized: { name: string; message: string; stack?: string; cause?: unknown } = {
    name: err.name,
    message: err.message,
    stack: err.stack,
  };
  if (errorWithCause.cause !== undefined) {
    serialized.cause = errorWithCause.cause instanceof Error ? serializeError(errorWithCause.cause) : errorWithCause.cause;
  }
  return redactSensitiveData(serialized) as typeof serialized;
}

const axiomToken = process.env.AXIOM_TOKEN;
const axiomDataset = process.env.AXIOM_DATASET || "openbts";

const transports: [Transport, ...Transport[]] = [new ConsoleTransport({ prettyPrint: true })];

if (axiomToken) {
  const axiom = new Axiom({ token: axiomToken });
  transports.push(
    new AxiomJSTransport({
      axiom,
      dataset: axiomDataset,
    }),
  );
}

const transportLogger = new Logger({ transports });

export const logger = {
  error(...args: Parameters<Logger["error"]>) {
    return transportLogger.error(...redactLogArguments(args));
  },
  info(...args: Parameters<Logger["info"]>) {
    return transportLogger.info(...redactLogArguments(args));
  },
  warn(...args: Parameters<Logger["warn"]>) {
    return transportLogger.warn(...redactLogArguments(args));
  },
};

export function installProcessErrorHandlers(): void {
  process.on("uncaughtException", (error: Error) => {
    logger.error("uncaught_exception", {
      ...serializeError(error),
    });
  });

  process.on("unhandledRejection", (reason: unknown) => {
    const serialized = serializeError(reason);
    logger.error("unhandled_rejection", serialized);
  });

  process.on("warning", (warning: Error) => {
    logger.warn("process_warning", serializeError(warning));
  });
}

export { serializeError };
