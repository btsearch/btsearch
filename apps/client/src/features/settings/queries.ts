import { queryOptions } from "@tanstack/react-query";
import type { Session } from "better-auth";

import { readAuthError } from "./authErrors";
import { API_BASE, fetchJson } from "@/lib/api";
import { authClient } from "@/lib/auth/client";

type ProfileContactInfo = { instagram?: string; facebook?: string; email?: string };

export type ProfileData = {
  bio: string | null;
  contactInfo: ProfileContactInfo | null;
  profileVisibility: string;
  hunterListing: boolean;
  hunterRegions: number[];
};

export type UsageWindow = {
  used: number;
  max: number | null;
  window: number;
  reset: number | null;
};

export type ApiKeyInfo = {
  id: string;
  name: string | null;
  start: string | null;
  expiresAt: string | null;
  createdAt: string;
  enabled: boolean | null;
  rateLimit: UsageWindow;
  quota: UsageWindow;
};

type ApiKeyLimits = {
  maxKeys: number | null;
  nextCreateAt: string | null;
};

type ApiKeysData = {
  keys: ApiKeyInfo[];
  limits: ApiKeyLimits;
};

type Consent = {
  id: string;
  clientId: string;
  scopes: string[];
  createdAt: Date;
};

type PublicClient = {
  client_id: string;
  client_name?: string;
  logo_uri?: string;
};

export type AuthorizedApp = Consent & { app: PublicClient | null };

export type OAuthApp = {
  client_id: string;
  client_name?: string;
  logo_uri?: string;
  redirect_uris: string[];
  client_id_issued_at?: number;
  application_type?: string | null;
  token_endpoint_auth_method?: string;
};

export type SessionDevice = {
  browser: string | undefined;
  os: string | undefined;
  mobile: boolean;
};

export type SessionWithDevice = Session & { device: SessionDevice };

export function accountProfileQueryOptions(userId: string) {
  return queryOptions({
    queryKey: ["account", "profile", userId] as const,
    queryFn: () => fetchJson<{ data: ProfileData }>(`${API_BASE}/account/profile`).then((response) => response.data),
  });
}

export function apiKeysQueryOptions(userId: string) {
  return queryOptions({
    queryKey: ["account", "api-keys", userId] as const,
    queryFn: () =>
      fetchJson<{ data: ApiKeyInfo[]; limits: ApiKeyLimits }>(`${API_BASE}/account/api-keys`).then((response): ApiKeysData => ({
        keys: response.data,
        limits: response.limits,
      })),
  });
}

export function passwordStatusQueryOptions(userId: string) {
  return queryOptions({
    queryKey: ["account", "password", userId] as const,
    queryFn: () => fetchJson<{ data: { hasPassword: boolean } }>(`${API_BASE}/account/password`).then((response) => response.data.hasPassword),
  });
}

export function authorizedAppsQueryOptions(userId: string) {
  return queryOptions({
    queryKey: ["account", "oauth-authorizations", userId] as const,
    queryFn: async () => {
      const response = await authClient.oauth2.getConsents();
      if (response.error) throw response.error;
      const consents: Consent[] = response.data ?? [];
      return Promise.all(
        consents.map(async (consent): Promise<AuthorizedApp> => {
          const appResponse = await authClient.oauth2.publicClient({ query: { client_id: consent.clientId } });
          return { ...consent, app: appResponse.error || !appResponse.data ? null : appResponse.data };
        }),
      );
    },
  });
}

export function oauthAppsQueryOptions(userId: string) {
  return queryOptions({
    queryKey: ["account", "oauth-apps", userId] as const,
    queryFn: async (): Promise<OAuthApp[]> => {
      const response = await authClient.oauth2.getClients();
      if (response.error) throw response.error;
      return response.data ?? [];
    },
  });
}

export function isPublishableKey(key: ApiKeyInfo): boolean {
  return key.start?.startsWith("pk_") ?? false;
}

export async function unwrapAuth<T>(request: Promise<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await request;
  if (error !== null && error !== undefined) throw error;
  if (data === null) throw new Error("Empty auth response");
  return data;
}

function retryAuthQuery(failureCount: number, error: unknown) {
  if (readAuthError(error).code !== undefined) return false;
  return failureCount < 2;
}

export function linkedAccountsQueryOptions(userId: string) {
  return queryOptions({
    queryKey: ["auth", "accounts", userId] as const,
    queryFn: () => unwrapAuth(authClient.listAccounts()),
    retry: retryAuthQuery,
  });
}

export function accountInfoQueryOptions(accountId: string) {
  return queryOptions({
    queryKey: ["auth", "account-info", accountId] as const,
    queryFn: () => unwrapAuth(authClient.accountInfo({ query: { accountId } })),
    retry: retryAuthQuery,
  });
}

export function sessionsQueryOptions(userId: string) {
  return queryOptions({
    queryKey: ["auth", "sessions", userId] as const,
    queryFn: async (): Promise<SessionWithDevice[]> => {
      const [sessions, { default: Bowser }] = await Promise.all([unwrapAuth(authClient.listSessions()), import("bowser")]);
      return sessions.map((session) => {
        const { browser, os, platform } = Bowser.parse(session.userAgent ?? "");
        const mobile = platform.type === "mobile" || platform.type === "tablet";
        return { ...session, device: { browser: browser.name, os: os.name, mobile } };
      });
    },
    retry: retryAuthQuery,
    staleTime: 0,
  });
}

export function passkeysQueryOptions(userId: string) {
  return queryOptions({
    queryKey: ["auth", "passkeys", userId] as const,
    queryFn: () => unwrapAuth(authClient.passkey.listUserPasskeys()),
    retry: retryAuthQuery,
  });
}
