import { fromBinary, toJson } from "@bufbuild/protobuf";
import type { DescMessage } from "@bufbuild/protobuf";
import { AUDIT_OPERATION_ID_HEADER, AUDIT_OPERATION_KIND_HEADER } from "@openbts/shared/audit";
import type { ClientSettableAuditOperationKind } from "@openbts/shared/audit";
import { customAlphabet, nanoid } from "nanoid";
import { toast } from "sonner";

export const API_BASE = import.meta.env.VITE_API_URL || "https://openbts.sakilabs.com/api/v1";
export const APP_NAME = import.meta.env.VITE_APP_NAME || "BTSearch";

type ApiError = { code: string; message: string; details?: unknown[] };

export type AuditOperationHandle = {
  id: string;
  kind: ClientSettableAuditOperationKind;
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

export function createAuditOperationHandle(kind: ClientSettableAuditOperationKind): AuditOperationHandle {
  const hex = generateAuditOperationHex();
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(12, 15)}-${generateAuditOperationVariant()}${hex.slice(15, 18)}-${hex.slice(18)}`;
  return { id, kind };
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

export class RateLimitError extends Error {
  constructor() {
    super("You have made too many requests. Please try again later.");
  }
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
  proto?: DescMessage;
};

export async function fetchJson<T>(url: string, options?: FetchOptions): Promise<T> {
  const { allowedErrors, auditOperation, proto, ...fetchOptions } = options ?? {};
  const shouldUpdateHeaders = fetchOptions.method === "POST" || auditOperation !== undefined || proto !== undefined;

  if (shouldUpdateHeaders) {
    const headers = new Headers(fetchOptions.headers);
    if (fetchOptions.method === "POST" && !headers.has("x-idempotency-key")) headers.set("x-idempotency-key", nanoid());
    if (auditOperation !== undefined) {
      headers.set(AUDIT_OPERATION_ID_HEADER, auditOperation.id);
      headers.set(AUDIT_OPERATION_KIND_HEADER, auditOperation.kind);
    }
    if (proto !== undefined) headers.set("accept", "application/x-protobuf");
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
      throw new RateLimitError();
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

  if (proto !== undefined && response.headers.get("content-type") === "application/x-protobuf") {
    const buffer = await response.arrayBuffer();
    const result = toJson(proto, fromBinary(proto, new Uint8Array(buffer)), { useProtoFieldName: true, emitDefaultValues: true }) as T;
    notifyBackendSuccess();
    return result;
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
  const result = await fetchJson<{ data: T }>(`${API_BASE}/${endpoint}`, options);
  return result?.data ?? (null as unknown as T);
}

export async function postApiData<T, B = unknown>(endpoint: string, body: B, idempotencyKey?: string): Promise<T> {
  const result = await fetchJson<{ data: T }>(`${API_BASE}/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
  return result.data;
}

export function showApiError(error: unknown) {
  if (error instanceof RateLimitError || error instanceof QuotaExceededError || error instanceof DuplicateRequestError) return;
  if (error instanceof ApiResponseError) {
    for (const err of error.errors) {
      toast.error(err.message || err.code);
    }
  } else if (error instanceof Error) {
    toast.error(error.message);
  } else {
    toast.error("An unexpected error occurred");
  }
}
