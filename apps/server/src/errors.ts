import type { FastifyError } from "fastify";
import postgres from "postgres";

export class ErrorResponse extends Error {
  code: ErrorCode;
  statusCode: number;
  cause?: unknown;

  constructor(code: ErrorCode, options?: { message?: string; cause?: unknown }) {
    super();

    const error = errors[code];
    if (!error) throw new Error(`Invalid error code: ${code}`);

    this.message = options?.message ? options.message : error.message;
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = error.statusCode;
    if (options?.cause !== undefined) this.cause = options.cause;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends ErrorResponse {
  details: { field: string; validationMessage: string | undefined }[];

  constructor(details: { field: string; validationMessage: string | undefined }[]) {
    super("VALIDATION_ERROR");
    this.details = details;
    this.statusCode = 400;
  }
}

export class DetailedErrorResponse extends ErrorResponse {
  details: unknown[];

  constructor(code: ErrorCode, details: unknown[], options?: { message?: string; cause?: unknown }) {
    super(code, options);
    this.details = details;
  }
}

export type ErrorCode =
  | "INTERNAL_SERVER_ERROR"
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "FAILED_TO_DELETE"
  | "INVALID_QUERY"
  | "FAILED_TO_UPDATE"
  | "FAILED_TO_CREATE"
  | "AUTH_FAILURE"
  | "VALIDATION_ERROR"
  | "ALREADY_LOGGED_IN"
  | "INSUFFICIENT_PERMISSIONS"
  | "TOO_MANY_REQUESTS"
  | "QUOTA_EXCEEDED"
  | "DUPLICATE_ENTRY"
  | "CONFLICT"
  | "SERVICE_UNAVAILABLE"
  | "MAINTENANCE_MODE"
  | "TWO_FACTOR_REQUIRED"
  | "DUPLICATE_REQUEST"
  | "PHOTO_TOO_SMALL"
  | "PHOTO_TOO_BLURRY"
  | "LIST_LIMIT_REACHED"
  | "FEATURE_DISABLED";

interface ErrorDefinition {
  message: string;
  statusCode: number;
}

export const errors: Record<ErrorCode, ErrorDefinition> = {
  INTERNAL_SERVER_ERROR: {
    message: "An internal server error occurred.",
    statusCode: 500,
  },
  BAD_REQUEST: {
    message: "The request was invalid.",
    statusCode: 400,
  },
  NOT_FOUND: {
    message: "The requested resource was not found.",
    statusCode: 404,
  },
  UNAUTHORIZED: {
    message: "You cannot access this resource.",
    statusCode: 401,
  },
  FORBIDDEN: {
    message: "You do not have access to this resource.",
    statusCode: 403,
  },
  FAILED_TO_DELETE: {
    message: "Failed to delete the resource.",
    statusCode: 500,
  },
  INVALID_QUERY: {
    message: "The parameters in the request are invalid.",
    statusCode: 400,
  },
  FAILED_TO_UPDATE: {
    message: "Failed to update the resource.",
    statusCode: 500,
  },
  FAILED_TO_CREATE: {
    message: "Failed to create the resource.",
    statusCode: 500,
  },
  AUTH_FAILURE: {
    message: "Internal authentication error.",
    statusCode: 500,
  },
  VALIDATION_ERROR: {
    message: "Validation error.",
    statusCode: 400,
  },
  ALREADY_LOGGED_IN: {
    message: "Already logged in.",
    statusCode: 400,
  },
  INSUFFICIENT_PERMISSIONS: {
    message: "You do not have permissions to perform this action.",
    statusCode: 403,
  },
  TOO_MANY_REQUESTS: {
    message: "You have made too many requests. Please try again later.",
    statusCode: 429,
  },
  QUOTA_EXCEEDED: {
    message: "Weekly usage quota exceeded. Please try again later.",
    statusCode: 429,
  },
  DUPLICATE_ENTRY: {
    message: "A duplicate entry already exists.",
    statusCode: 409,
  },
  CONFLICT: {
    message: "The resource conflicts with its current state.",
    statusCode: 409,
  },
  SERVICE_UNAVAILABLE: {
    message: "The service is temporarily unavailable.",
    statusCode: 503,
  },
  MAINTENANCE_MODE: {
    message: "The site is temporarily unavailable for maintenance. Please try again later.",
    statusCode: 503,
  },
  TWO_FACTOR_REQUIRED: {
    message: "Two-factor authentication must be enabled to access this resource.",
    statusCode: 403,
  },
  DUPLICATE_REQUEST: {
    message: "A request with this idempotency key is already being processed.",
    statusCode: 409,
  },
  PHOTO_TOO_SMALL: {
    message: "Photo resolution is too low. Use an image at least 640 by 480 pixels.",
    statusCode: 400,
  },
  PHOTO_TOO_BLURRY: {
    message: "Photo is too blurry. Please use a clearer image.",
    statusCode: 400,
  },
  LIST_LIMIT_REACHED: {
    message: "You have reached the maximum number of lists.",
    statusCode: 400,
  },
  FEATURE_DISABLED: {
    message: "This feature is disabled.",
    statusCode: 403,
  },
};

const GENERIC_FAILURE_CODES = new Set<ErrorCode>(["INTERNAL_SERVER_ERROR", "FAILED_TO_CREATE", "FAILED_TO_UPDATE", "FAILED_TO_DELETE"]);
const CAUSE_CHAIN_LIMIT = 6;
const STRING_DATA_RIGHT_TRUNCATION = "22001";
const NUMERIC_VALUE_OUT_OF_RANGE = "22003";
const INVALID_DATETIME_FORMAT = "22007";
const DATETIME_FIELD_OVERFLOW = "22008";
const CHARACTER_NOT_IN_REPERTOIRE = "22021";
const INVALID_TEXT_REPRESENTATION = "22P02";
const RESTRICT_VIOLATION = "23001";
export const FOREIGN_KEY_VIOLATION = "23503";
const CHECK_VIOLATION = "23514";
export const UNIQUE_VIOLATION = "23505";
export const SERIALIZATION_FAILURE = "40001";
export const DEADLOCK_DETECTED = "40P01";
const DELETE_STATEMENT = /^\s*delete\b/i;
const STILL_REFERENCED_MESSAGE = "Cannot delete a record that other records still use.";
const MALFORMED_MULTIPART = /^Multipart: Boundary not found$|unexpected end of multipart data$/i;
export const MALFORMED_MULTIPART_MESSAGE = "The multipart request body is malformed or incomplete.";

function postgresCause(error: unknown): postgres.PostgresError | null {
  let current = error;
  for (let depth = 0; depth < CAUSE_CHAIN_LIMIT && current instanceof Error; depth++) {
    if (current instanceof postgres.PostgresError) return current;
    current = current.cause;
  }
  return null;
}

export function isStillReferenced(databaseError: postgres.PostgresError): boolean {
  const refusesDelete = databaseError.code === FOREIGN_KEY_VIOLATION && DELETE_STATEMENT.test(databaseError.query);
  return databaseError.code === RESTRICT_VIOLATION || refusesDelete;
}

function isGenericFailure(error: ErrorResponse): boolean {
  return GENERIC_FAILURE_CODES.has(error.code) && error.message === errors[error.code].message;
}

function parserFault(error: unknown): Error | null {
  let current = error;
  for (let depth = 0; depth < CAUSE_CHAIN_LIMIT && current instanceof Error; depth++) {
    const { name, statusCode }: Partial<FastifyError> = current;
    if (name === "FastifyError" && statusCode !== undefined && statusCode < 500) return current;
    if (MALFORMED_MULTIPART.test(current.message)) return new ErrorResponse("BAD_REQUEST", { message: MALFORMED_MULTIPART_MESSAGE, cause: error });
    current = current.cause;
  }
  return null;
}

export function callerFaultResponse(error: unknown): Error | null {
  if (error instanceof ErrorResponse && !isGenericFailure(error)) return null;

  const databaseError = postgresCause(error);
  if (databaseError === null) return parserFault(error);
  if (isStillReferenced(databaseError)) return new ErrorResponse("CONFLICT", { message: STILL_REFERENCED_MESSAGE, cause: error });

  switch (databaseError.code) {
    case NUMERIC_VALUE_OUT_OF_RANGE:
    case DATETIME_FIELD_OVERFLOW:
      return new ErrorResponse("BAD_REQUEST", { message: "A value in the request is out of range.", cause: error });
    case STRING_DATA_RIGHT_TRUNCATION:
      return new ErrorResponse("BAD_REQUEST", { message: "A value in the request is too long.", cause: error });
    case INVALID_DATETIME_FORMAT:
    case CHARACTER_NOT_IN_REPERTOIRE:
    case INVALID_TEXT_REPRESENTATION:
    case CHECK_VIOLATION:
      return new ErrorResponse("BAD_REQUEST", { message: "A value in the request is not valid.", cause: error });
    case FOREIGN_KEY_VIOLATION:
      return new ErrorResponse("BAD_REQUEST", { message: "The request refers to a record that does not exist.", cause: error });
    case UNIQUE_VIOLATION:
      return new ErrorResponse("DUPLICATE_ENTRY", { cause: error });
    default:
      return null;
  }
}
