import { ApiResponseError } from "@/lib/api";
import { MOST_LIST_VALUES } from "@/lib/apiValues";

const REJECTED_TEXT_STATUS = 400;
const REJECTED_TEXT_CODE = "INVALID_QUERY";

export function setListParam(params: URLSearchParams, name: string, values: readonly (string | number)[]): void {
  if (values.length > 0) params.set(name, values.slice(0, MOST_LIST_VALUES).join(","));
}

export function isRejectedSearchText(error: unknown): boolean {
  if (!(error instanceof ApiResponseError) || error.status !== REJECTED_TEXT_STATUS) return false;
  return error.errors.some((entry) => entry.code === REJECTED_TEXT_CODE);
}
