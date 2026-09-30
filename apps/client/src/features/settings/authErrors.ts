import i18next from "i18next";
import { toast } from "sonner";

import { isGloballyHandledError, showApiError } from "@/lib/api";

const FRESH_SESSION_ERROR_CODES = new Set(["SESSION_NOT_FRESH", "SESSION_EXPIRED"]);
const PASSKEY_CANCEL_ERROR_CODES = new Set(["ERROR_CEREMONY_ABORTED", "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY", "AUTH_CANCELLED"]);

export function readAuthError(error: unknown): { code: string | undefined; message: string | undefined } {
  if (typeof error !== "object" || error === null) return { code: undefined, message: undefined };
  const source = "error" in error && typeof error.error === "object" && error.error !== null ? error.error : error;
  return {
    code: "code" in source && typeof source.code === "string" ? source.code : undefined,
    message: "message" in source && typeof source.message === "string" ? source.message : undefined,
  };
}

function hasAuthErrorCode(error: unknown, codes: ReadonlySet<string>): boolean {
  const { code } = readAuthError(error);
  return code !== undefined && codes.has(code);
}

export function isFreshSessionError(error: unknown): boolean {
  return hasAuthErrorCode(error, FRESH_SESSION_ERROR_CODES);
}

export function isPasskeyCancelError(error: unknown): boolean {
  return hasAuthErrorCode(error, PASSKEY_CANCEL_ERROR_CODES);
}

export function showSettingsError(error: unknown) {
  if (isGloballyHandledError(error)) return;
  if (isFreshSessionError(error)) {
    toast.error(i18next.t("settings:security.freshSessionRequired"));
    return;
  }
  if (error instanceof Error && !("error" in error)) {
    showApiError(error);
    return;
  }
  const { message } = readAuthError(error);
  toast.error(i18next.t("common:error.actionFailed"), { description: message ?? i18next.t("common:error.tryLater") });
}
