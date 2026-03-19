import { fromBinary, toJson } from "@bufbuild/protobuf";
import type { DescMessage } from "@bufbuild/protobuf";
import { toast } from "sonner";

export const API_BASE = import.meta.env.VITE_API_URL || "https://openbts.sakilabs.com/api/v1";
export const APP_NAME = import.meta.env.VITE_APP_NAME || "BTSearch";

type ApiError = { code: string; message: string };

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
  proto?: DescMessage;
};

export async function fetchJson<T>(url: string, options?: FetchOptions): Promise<T> {
  const { allowedErrors, ...fetchOptions } = options ?? {};

  if (fetchOptions.method === "POST") {
    const headers = new Headers(fetchOptions.headers as HeadersInit | undefined);
    if (!headers.has("x-idempotency-key")) headers.set("x-idempotency-key", crypto.randomUUID());
    fetchOptions.headers = headers;
  }

  if (options?.proto) {
    const headers = new Headers(fetchOptions.headers as HeadersInit | undefined);
    headers.set("accept", "application/x-protobuf");
    fetchOptions.headers = headers;
  }

  let response: Response;
  try {
    response = await fetch(url, { credentials: "include", ...fetchOptions });
  } catch {
    throw new BackendUnavailableError(0);
  }

  if (!response.ok) {
    if (allowedErrors?.includes(response.status)) return null as unknown as T;

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

  if (options?.proto && response.headers.get("content-type") === "application/x-protobuf") {
    const buffer = await response.arrayBuffer();
    return toJson(options.proto, fromBinary(options.proto, new Uint8Array(buffer)), { useProtoFieldName: true, emitDefaultValues: true }) as T;
  }

  if (response.status === 204) return undefined as unknown as T;
  return response.json();
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
