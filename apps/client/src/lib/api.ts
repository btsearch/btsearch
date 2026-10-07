import { AUDIT_OPERATION_ID_HEADER } from "@openbts/shared/audit";
import i18next from "i18next";
import { customAlphabet, nanoid } from "nanoid";
import { toast } from "sonner";

export const API_BASE = import.meta.env.VITE_API_URL || "https://openbts.sakilabs.com/api/v1";
export const API_V2_BASE = API_BASE.replace(/\/v1\/?$/, "/v2");
export const APP_NAME = import.meta.env.VITE_APP_NAME || "BTSearch";
export const JSON_HEADERS = { "Content-Type": "application/json" };
export const NOT_FOUND_STATUS = 404;
export const CONFLICT_STATUS = 409;

type ApiError = { code: string; message: string; details?: unknown[] };

export type DataEnvelope<T> = { data: T };

export type AuditOperationHandle = {
  id: string;
};

type BackendSuccessListener = () => void;

const backendSuccessListeners = new Set<BackendSuccessListener>();
const generateAuditOperationHex = customAlphabet("0123456789abcdef", 30);
const generateAuditOperationVariant = customAlphabet("89ab", 1);

function notifyBackendSuccess(): void {
  for (const listener of backendSuccessListeners) listener();
}

export function subscribeToBackendSuccess(listener: BackendSuccessListener): () => void {
  backendSuccessListeners.add(listener);
  return () => backendSuccessListeners.delete(listener);
}

export function createAuditOperationHandle(): AuditOperationHandle {
  const hex = generateAuditOperationHex();
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(12, 15)}-${generateAuditOperationVariant()}${hex.slice(15, 18)}-${hex.slice(18)}`;
  return { id };
}

export class ApiResponseError extends Error {
  errors: ApiError[];
  status: number;

  constructor(status: number, errors: ApiError[]) {
    super(errors[0]?.message || `Request failed: ${status}`);
    this.status = status;
    this.errors = errors;
  }
}

export class BackendUnavailableError extends Error {
  status: number;

  constructor(status: number) {
    super(`Backend unavailable (HTTP ${status})`);
    this.status = status;
  }
}

export class MaintenanceModeError extends Error {
  constructor() {
    super("Maintenance in progress");
  }
}

export class RateLimitError extends Error {
  retryAfterSeconds: number | null;

  constructor(retryAfterSeconds: number | null = null) {
    super("You have made too many requests. Please try again later.");
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function readRetryAfterSeconds(response: Response): number | null {
  const header = response.headers.get("X-Retry-After");
  if (header === null || header.trim() === "") return null;

  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds) : null;
}

export class QuotaExceededError extends Error {
  constructor() {
    super("Weekly usage quota exceeded. Please try again later.");
  }
}

export class TwoFactorRequiredError extends Error {
  constructor() {
    super("Two-factor authentication must be enabled to access this resource.");
  }
}

export class DuplicateRequestError extends Error {
  constructor() {
    super("A request with this idempotency key is already being processed.");
  }
}

type FetchOptions = RequestInit & {
  allowedErrors?: number[];
  auditOperation?: AuditOperationHandle;
};

function isMaintenanceResponse(payload: unknown): boolean {
  if (typeof payload !== "object" || payload === null || !("errors" in payload) || !Array.isArray(payload.errors)) return false;

  return payload.errors.some((error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "MAINTENANCE_MODE");
}

export async function fetchJson<T>(url: string, options?: FetchOptions): Promise<T> {
  const { allowedErrors, auditOperation, ...fetchOptions } = options ?? {};
  const shouldUpdateHeaders = fetchOptions.method === "POST" || auditOperation !== undefined;

  if (shouldUpdateHeaders) {
    const headers = new Headers(fetchOptions.headers);
    if (fetchOptions.method === "POST" && !headers.has("x-idempotency-key")) headers.set("x-idempotency-key", nanoid());
    if (auditOperation !== undefined) headers.set(AUDIT_OPERATION_ID_HEADER, auditOperation.id);
    fetchOptions.headers = headers;
  }

  let response: Response;
  try {
    response = await fetch(url, { credentials: "include", ...fetchOptions });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new BackendUnavailableError(0);
  }

  if (!response.ok) {
    if (allowedErrors?.includes(response.status)) {
      notifyBackendSuccess();
      return null as unknown as T;
    }

    if (response.status === 409) {
      try {
        const errorData = await response.json();
        if (errorData.errors?.[0]?.code === "DUPLICATE_REQUEST") throw new DuplicateRequestError();
        if (errorData.errors?.length) throw new ApiResponseError(response.status, errorData.errors);
      } catch (e) {
        if (e instanceof DuplicateRequestError || e instanceof ApiResponseError) throw e;
      }
    }

    if (response.status === 429) {
      try {
        const errorData = await response.json();
        if (errorData.errors?.[0]?.code === "QUOTA_EXCEEDED") throw new QuotaExceededError();
      } catch (e) {
        if (e instanceof QuotaExceededError) throw e;
      }
      throw new RateLimitError(readRetryAfterSeconds(response));
    }

    if (response.status === 503) {
      const errorData: unknown = await response.json().catch(() => null);
      if (isMaintenanceResponse(errorData)) throw new MaintenanceModeError();
    }

    if (response.status === 502 || response.status === 503 || response.status === 504) {
      throw new BackendUnavailableError(response.status);
    }

    if (response.status === 500) {
      try {
        const errorData = await response.json();
        if (errorData.errors?.length) throw new ApiResponseError(response.status, errorData.errors);
      } catch (e) {
        if (e instanceof ApiResponseError) throw e;
        throw new BackendUnavailableError(response.status);
      }
    }

    try {
      const errorData = await response.json();
      if (errorData.errors?.[0]?.code === "TWO_FACTOR_REQUIRED") throw new TwoFactorRequiredError();
      if (errorData.errors?.length) throw new ApiResponseError(response.status, errorData.errors);
    } catch (e) {
      if (e instanceof ApiResponseError || e instanceof TwoFactorRequiredError) throw e;
    }

    throw new Error(`Request failed: ${response.status}`);
  }

  if (response.status === 204) {
    notifyBackendSuccess();
    return undefined as unknown as T;
  }

  const result = await response.json();
  notifyBackendSuccess();
  return result;
}

export async function fetchApiData<T>(endpoint: string, options?: FetchOptions): Promise<T> {
  const result = await fetchJson<DataEnvelope<T>>(`${API_BASE}/${endpoint}`, options);
  return result?.data ?? (null as unknown as T);
}

export async function fetchV2Data<T>(path: string, options?: FetchOptions): Promise<T> {
  const response = await fetchJson<DataEnvelope<T>>(`${API_V2_BASE}/${path}`, options);
  return response.data;
}

export async function postApiData<T, B = unknown>(endpoint: string, body: B, idempotencyKey?: string): Promise<T> {
  const result = await fetchJson<DataEnvelope<T>>(`${API_BASE}/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
  return result.data;
}

export function appendList(params: URLSearchParams, key: string, values: readonly (string | number)[] | undefined): void {
  if (values !== undefined && values.length > 0) params.set(key, values.join(","));
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiResponseError && error.status === NOT_FOUND_STATUS;
}

export function isConflict(error: unknown): boolean {
  return error instanceof ApiResponseError && error.status === CONFLICT_STATUS;
}

export function readValidationMessages(details: readonly unknown[] | undefined): string[] {
  const messages: string[] = [];
  for (const detail of details ?? []) {
    if (typeof detail !== "object" || detail === null || !("validationMessage" in detail)) continue;
    if (typeof detail.validationMessage === "string") messages.push(detail.validationMessage);
  }
  return messages;
}

export function isGloballyHandledError(error: unknown): boolean {
  return (
    error instanceof RateLimitError ||
    error instanceof QuotaExceededError ||
    error instanceof DuplicateRequestError ||
    error instanceof MaintenanceModeError
  );
}

export function showApiError(error: unknown) {
  if (isGloballyHandledError(error)) return;
  if (error instanceof BackendUnavailableError) {
    toast.error(i18next.t("common:error.serverUnreachable"), {
      description: i18next.t(error.status === 0 ? "common:error.loadDescription" : "common:error.tryLater"),
    });
    return;
  }
  if (error instanceof ApiResponseError) {
    for (const err of error.errors) toast.error(i18next.t("common:error.actionFailed"), { description: err.message || err.code });
    return;
  }
  if (error instanceof TwoFactorRequiredError) {
    toast.error(i18next.t("common:error.actionFailed"), { description: i18next.t("settings:twoFactor.setupRequired") });
    return;
  }
  toast.error(i18next.t("common:error.actionFailed"), { description: i18next.t("common:error.tryLater") });
}
