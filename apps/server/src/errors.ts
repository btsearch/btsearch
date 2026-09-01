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
  | "SERVICE_UNAVAILABLE"
  | "TWO_FACTOR_REQUIRED"
  | "DUPLICATE_REQUEST";

interface ErrorDefinition {
  message: string;
  statusCode: number;
}

const errors: Record<ErrorCode, ErrorDefinition> = {
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
  SERVICE_UNAVAILABLE: {
    message: "The service is temporarily unavailable.",
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
};
