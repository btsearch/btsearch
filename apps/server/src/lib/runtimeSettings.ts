import { redis } from "../database/redis.js";

type NonEmptyString = string & { __brand: "NonEmptyString" };

export interface Announcement {
  message: string;
  enabled: boolean;
  type: "info" | "warning" | "error";
}

export interface RuntimeSettings {
  enforceAuthForAllRoutes: boolean;
  allowedUnauthenticatedRoutes: NonEmptyString[];
  disabledRoutes: NonEmptyString[];
  enableStationComments: boolean;
  commentQueueEnabled: boolean;
  submissionsEnabled: boolean;
  enableUserLists: boolean;
  photosEnabled: boolean;
  announcement: Announcement;
}

const SETTINGS_KEY = "runtime:settings";
const CHANNEL = "runtime:settings:updates";

const defaultSettings: RuntimeSettings = {
  enforceAuthForAllRoutes: false,
  allowedUnauthenticatedRoutes: ["/api/v1/auth"] as NonEmptyString[],
  disabledRoutes: [],
  enableStationComments: false,
  commentQueueEnabled: false,
  submissionsEnabled: true,
  enableUserLists: false,
  photosEnabled: true,
  announcement: { message: "", enabled: false, type: "info" },
};

let inMemorySettings: RuntimeSettings = { ...defaultSettings };
let initialized = false;

function isNonEmptyString(value: unknown): value is NonEmptyString {
  return typeof value === "string" && value.length > 0;
}

function isSettings(obj: unknown): obj is RuntimeSettings {
  if (!obj || typeof obj !== "object") return false;
  const candidate = obj as RuntimeSettings;
  return (
    typeof candidate.enforceAuthForAllRoutes === "boolean" &&
    Array.isArray(candidate.allowedUnauthenticatedRoutes) &&
    candidate.allowedUnauthenticatedRoutes.every(isNonEmptyString) &&
    Array.isArray(candidate.disabledRoutes) &&
    candidate.disabledRoutes.every(isNonEmptyString) &&
    typeof candidate.enableStationComments === "boolean" &&
    typeof candidate.commentQueueEnabled === "boolean" &&
    typeof candidate.submissionsEnabled === "boolean" &&
    typeof candidate.enableUserLists === "boolean" &&
    typeof candidate.photosEnabled === "boolean" &&
    candidate.announcement !== null &&
    typeof candidate.announcement === "object" &&
    typeof candidate.announcement.enabled === "boolean" &&
    typeof candidate.announcement.message === "string" &&
    (candidate.announcement.type === "info" || candidate.announcement.type === "warning" || candidate.announcement.type === "error")
  );
}

function deepMergeSettings(base: RuntimeSettings, patch: Partial<RuntimeSettings>): RuntimeSettings {
  const next: RuntimeSettings = { ...base };
  if (typeof patch.enforceAuthForAllRoutes === "boolean") next.enforceAuthForAllRoutes = patch.enforceAuthForAllRoutes;
  if (typeof patch.enableStationComments === "boolean") next.enableStationComments = patch.enableStationComments;
  if (typeof patch.commentQueueEnabled === "boolean") next.commentQueueEnabled = patch.commentQueueEnabled;
  if (typeof patch.submissionsEnabled === "boolean") next.submissionsEnabled = patch.submissionsEnabled;
  if (typeof patch.photosEnabled === "boolean") next.photosEnabled = patch.photosEnabled;
  if (typeof patch.enableUserLists === "boolean") next.enableUserLists = patch.enableUserLists;
  if (Array.isArray(patch.allowedUnauthenticatedRoutes))
    next.allowedUnauthenticatedRoutes = patch.allowedUnauthenticatedRoutes.filter(isNonEmptyString) as NonEmptyString[];
  if (Array.isArray(patch.disabledRoutes)) next.disabledRoutes = patch.disabledRoutes.filter(isNonEmptyString) as NonEmptyString[];
  if (patch.announcement && typeof patch.announcement === "object") next.announcement = { ...patch.announcement };
  return next;
}

export async function initRuntimeSettings(): Promise<void> {
  if (initialized) return;
  try {
    const existing = await redis.get(SETTINGS_KEY);
    if (existing) {
      const parsed = JSON.parse(existing);
      if (isSettings(parsed)) {
        inMemorySettings = parsed;
      } else if (parsed && typeof parsed === "object") {
        inMemorySettings = deepMergeSettings(defaultSettings, parsed);
        await redis.set(SETTINGS_KEY, JSON.stringify(inMemorySettings));
      } else {
        inMemorySettings = { ...defaultSettings };
      }
    } else {
      await redis.set(SETTINGS_KEY, JSON.stringify(defaultSettings));
      inMemorySettings = { ...defaultSettings };
    }
  } catch {
    inMemorySettings = { ...defaultSettings };
  }

  const subscriber = redis.duplicate();
  await subscriber.connect();
  await subscriber.subscribe(CHANNEL, (message) => {
    try {
      const parsed = JSON.parse(message);
      if (isSettings(parsed)) inMemorySettings = parsed;
    } catch {}
  });

  initialized = true;
}

export function getRuntimeSettings(): RuntimeSettings {
  return inMemorySettings;
}

export async function updateRuntimeSettings(patch: Partial<RuntimeSettings>): Promise<RuntimeSettings> {
  const next = deepMergeSettings(inMemorySettings, patch);
  inMemorySettings = next;
  const json = JSON.stringify(next);
  await Promise.all([redis.set(SETTINGS_KEY, json), redis.publish(CHANNEL, json)]);
  return next;
}

export function getDefaultRuntimeSettings(): RuntimeSettings {
  return { ...defaultSettings };
}
