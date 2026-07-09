export type SerializedWorkerError = {
  name: string;
  message: string;
  stack?: string;
  cause?: SerializedWorkerError | string;
};

type ErrorWithCause = Error & { cause?: unknown };

export function serializeWorkerError(error: unknown): SerializedWorkerError {
  if (!(error instanceof Error)) return { name: "Error", message: String(error) };

  const cause = (error as ErrorWithCause).cause;
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    ...(cause !== undefined ? { cause: serializeWorkerErrorCause(cause) } : {}),
  };
}

function serializeWorkerErrorCause(cause: unknown): SerializedWorkerError | string {
  if (cause instanceof Error) return serializeWorkerError(cause);
  if (typeof cause !== "object" || cause === null) return String(cause);

  try {
    return JSON.stringify(cause);
  } catch {
    return Object.prototype.toString.call(cause);
  }
}

export function deserializeWorkerError(error: SerializedWorkerError | string | undefined): Error {
  if (error === undefined) return new Error("CLF export worker failed");
  if (typeof error === "string") return new Error(error);

  const result = new Error(error.message);
  result.name = error.name;
  if (error.stack !== undefined) result.stack = error.stack;
  if (error.cause !== undefined) (result as ErrorWithCause).cause = error.cause;
  return result;
}
