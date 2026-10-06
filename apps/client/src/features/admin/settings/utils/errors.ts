import i18next from "i18next";
import { toast } from "sonner";

import { ApiResponseError, CONFLICT_STATUS, readValidationMessages, showApiError } from "@/lib/api";

export type SettingsErrorText = { key: string; values?: Record<string, string | number> };

type ServerError = ApiResponseError["errors"][number];

const REFUSAL_STATUS = 400;
const CONFLICT_KEY = "admin:settings.errors.conflict";
const REFUSED_KEY = "admin:settings.routes.errors.refused";
const FORMAT_KEY = "admin:settings.routes.errors.format";
const UNKNOWN_ROUTE_KEY = "admin:settings.routes.errors.unknownRoute";
const LOCKOUT_KEY = "admin:settings.routes.errors.lockout";
const NAMED_LOCKOUT_KEY = "admin:settings.routes.errors.lockoutNamed";
const FORMAT_MESSAGE = "Must be a specific path under /api/v1/ or /api/v2/";
const UNKNOWN_ROUTE_PATTERN = /^No route starts with "(.+)"$/;
const LOCKOUT_PATTERN = /^"(.+)" would disable the sign-in routes, the settings routes or the health check$/;

function findRouteSentenceText(message: string, submittedEntry?: string): SettingsErrorText | null {
  if (message === FORMAT_MESSAGE) return { key: FORMAT_KEY };

  const unknownRoute = UNKNOWN_ROUTE_PATTERN.exec(message);
  if (unknownRoute !== null) return { key: UNKNOWN_ROUTE_KEY, values: { value: unknownRoute[1] } };

  const lockout = LOCKOUT_PATTERN.exec(message);
  if (lockout === null) return null;
  return lockout[1] === submittedEntry ? { key: LOCKOUT_KEY } : { key: NAMED_LOCKOUT_KEY, values: { value: lockout[1] } };
}

function findServerErrorText(serverError: ServerError, submittedEntry?: string): SettingsErrorText | null {
  for (const message of [serverError.message, ...readValidationMessages(serverError.details)]) {
    const text = findRouteSentenceText(message, submittedEntry);
    if (text !== null) return text;
  }
  return null;
}

function findRefusalText(error: ApiResponseError, submittedEntry?: string): SettingsErrorText | null {
  for (const serverError of error.errors) {
    const text = findServerErrorText(serverError, submittedEntry);
    if (text !== null) return text;
  }
  return null;
}

function findSettingsErrorText(error: unknown): SettingsErrorText | null {
  if (!(error instanceof ApiResponseError)) return null;
  if (error.status === CONFLICT_STATUS) return { key: CONFLICT_KEY };
  return error.status === REFUSAL_STATUS ? findRefusalText(error) : null;
}

export function isRefusal(error: unknown): error is ApiResponseError {
  return error instanceof ApiResponseError && error.status === REFUSAL_STATUS;
}

export function getRouteRefusalText(error: ApiResponseError, submittedEntry: string): SettingsErrorText {
  return findRefusalText(error, submittedEntry) ?? { key: REFUSED_KEY };
}

export function showSettingsError(error: unknown): void {
  const text = findSettingsErrorText(error);
  if (text === null) {
    showApiError(error);
    return;
  }
  toast.error(i18next.t("common:error.actionFailed"), { description: i18next.t(text.key, text.values) });
}
