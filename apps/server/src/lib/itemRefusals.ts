import { DetailedErrorResponse, type ErrorCode, ErrorResponse, ValidationError } from "../errors.js";
import { toFieldPath } from "./fieldPath.js";

const FIRST_SERVER_FAULT_STATUS = 500;

function isRefusalWithoutDetails(error: unknown): error is ErrorResponse {
  if (!(error instanceof ErrorResponse) || error.statusCode >= FIRST_SERVER_FAULT_STATUS) return false;
  return !(error instanceof ValidationError) && !(error instanceof DetailedErrorResponse);
}

export function itemRefusal(code: ErrorCode, message: string, path: readonly PropertyKey[]): DetailedErrorResponse {
  return new DetailedErrorResponse(code, [{ field: toFieldPath(path) }], { message });
}

export async function pointRefusalsAtItem<T>(index: number, run: () => T | Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!isRefusalWithoutDetails(error)) throw error;
    throw new DetailedErrorResponse(error.code, [{ field: String(index) }], { message: error.message, cause: error });
  }
}
