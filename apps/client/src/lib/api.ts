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

type FetchOptions = RequestInit & {
  allowedErrors?: number[];
};

export async function fetchJson<T>(url: string, options?: FetchOptions): Promise<T> {
  const { allowedErrors, ...fetchOptions } = options ?? {};

  const response = await fetch(url, { credentials: "include", ...fetchOptions });

  if (!response.ok) {
    if (allowedErrors?.includes(response.status)) return null as unknown as T;

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

  if (response.status === 204) return undefined as unknown as T;
  return response.json();
}

export async function fetchApiData<T>(endpoint: string, options?: FetchOptions): Promise<T> {
  const result = await fetchJson<{ data: T }>(`${API_BASE}/${endpoint}`, options);
  return result?.data ?? (null as unknown as T);
}

export async function postApiData<T, B = unknown>(endpoint: string, body: B): Promise<T> {
  const result = await fetchJson<{ data: T }>(`${API_BASE}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return result.data;
}

export function showApiError(error: unknown) {
  if (error instanceof RateLimitError || error instanceof QuotaExceededError) return;
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
