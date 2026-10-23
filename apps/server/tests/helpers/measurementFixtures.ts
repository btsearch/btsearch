import type { DeviceRow } from "../../src/features/measurements/devices.js";
import { getRuntimeSettings, mergeRuntimeSettings } from "../../src/lib/runtimeSettings.js";
import type { OAuthTokenContext } from "../../src/plugins/auth/oauthToken.js";
import { userSession } from "./boundaries.js";

export const appClientId = "btsearch-app";
export const deviceId = "01a0bdd4-4400-7d2e-8f30-415263748596";

export const crowdSettingsRow = {
  id: 1,
  rawRetentionDays: 365,
  rawStorageBudgetGb: 100,
  minAppVersionCode: 100,
  termsVersion: 2,
  updatedAt: new Date("2026-10-01T00:00:00Z"),
  updatedById: null,
};

export function setMeasurementUploads(isEnabled: boolean): void {
  Object.assign(getRuntimeSettings(), mergeRuntimeSettings(getRuntimeSettings(), { measurementUploadsEnabled: isEnabled }));
}

export function appToken(userId = userSession().user.id): OAuthTokenContext {
  return { clientId: appClientId, scopes: ["upload:observations"], userId };
}

export function deviceRow(overrides: Partial<DeviceRow> = {}): DeviceRow {
  return {
    id: deviceId,
    userId: userSession().user.id,
    label: "Pixel 8",
    createdAt: new Date("2026-10-20T10:00:00Z"),
    manufacturer: "Google",
    model: "Pixel 8",
    socModel: "Tensor G3",
    tier: "none",
    securityLevel: null,
    verifiedBootState: null,
    isBootloaderLocked: null,
    revokedAt: null,
    revocationReason: null,
    lastUploadAt: null,
    sortKey: null,
    ...overrides,
  };
}
