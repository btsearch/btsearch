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
  pscEnabled: boolean;
  bsicEnabled: boolean;
  announcement: Announcement;
}

export interface RuntimeSettingsPatch extends Partial<Omit<RuntimeSettings, "allowedUnauthenticatedRoutes" | "disabledRoutes" | "announcement">> {
  allowedUnauthenticatedRoutes?: string[];
  disabledRoutes?: string[];
  announcement?: Partial<Announcement>;
}

const SETTINGS_KEY = "runtime:settings";
const CHANNEL = "runtime:settings:updates";
const RESYNC_INTERVAL_MS = 60_000;

const defaultSettings: RuntimeSettings = {
  enforceAuthForAllRoutes: false,
  allowedUnauthenticatedRoutes: ["/api/v1/auth"] as NonEmptyString[],
  disabledRoutes: [],
  enableStationComments: false,
  commentQueueEnabled: false,
  submissionsEnabled: true,
  enableUserLists: false,
  photosEnabled: true,
  pscEnabled: false,
  bsicEnabled: false,
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
    typeof candidate.pscEnabled === "boolean" &&
    typeof candidate.bsicEnabled === "boolean" &&
    candidate.announcement !== null &&
    typeof candidate.announcement === "object" &&
    typeof candidate.announcement.enabled === "boolean" &&
    typeof candidate.announcement.message === "string" &&
    (candidate.announcement.type === "info" || candidate.announcement.type === "warning" || candidate.announcement.type === "error")
  );
}

function parseSettings(json: string | null): RuntimeSettings | null {
  if (!json) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    return isSettings(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function mergeAnnouncement(base: Announcement, patch: Partial<Announcement>): Announcement {
  return {
    message: patch.message ?? base.message,
    enabled: patch.enabled ?? base.enabled,
    type: patch.type ?? base.type,
  };
}

export function mergeRuntimeSettings(base: RuntimeSettings, patch: RuntimeSettingsPatch): RuntimeSettings {
  const next: RuntimeSettings = { ...base };
  if (typeof patch.enforceAuthForAllRoutes === "boolean") next.enforceAuthForAllRoutes = patch.enforceAuthForAllRoutes;
  if (typeof patch.enableStationComments === "boolean") next.enableStationComments = patch.enableStationComments;
  if (typeof patch.commentQueueEnabled === "boolean") next.commentQueueEnabled = patch.commentQueueEnabled;
  if (typeof patch.submissionsEnabled === "boolean") next.submissionsEnabled = patch.submissionsEnabled;
  if (typeof patch.photosEnabled === "boolean") next.photosEnabled = patch.photosEnabled;
  if (typeof patch.enableUserLists === "boolean") next.enableUserLists = patch.enableUserLists;
  if (typeof patch.pscEnabled === "boolean") next.pscEnabled = patch.pscEnabled;
  if (typeof patch.bsicEnabled === "boolean") next.bsicEnabled = patch.bsicEnabled;
  if (Array.isArray(patch.allowedUnauthenticatedRoutes))
    next.allowedUnauthenticatedRoutes = patch.allowedUnauthenticatedRoutes.filter(isNonEmptyString) as NonEmptyString[];
  if (Array.isArray(patch.disabledRoutes)) next.disabledRoutes = patch.disabledRoutes.filter(isNonEmptyString) as NonEmptyString[];
  if (patch.announcement && typeof patch.announcement === "object") next.announcement = mergeAnnouncement(base.announcement, patch.announcement);
  return next;
}

async function resyncRuntimeSettings(): Promise<void> {
  const stored = parseSettings(await redis.get(SETTINGS_KEY).catch(() => null));
  if (stored && JSON.stringify(stored) !== JSON.stringify(inMemorySettings)) inMemorySettings = stored;
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
        inMemorySettings = mergeRuntimeSettings(defaultSettings, parsed);
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
    const published = parseSettings(message);
    if (published) inMemorySettings = published;
  });
  setInterval(() => void resyncRuntimeSettings(), RESYNC_INTERVAL_MS).unref();

  initialized = true;
}

export function getRuntimeSettings(): RuntimeSettings {
  return inMemorySettings;
}

export async function loadStoredRuntimeSettings(): Promise<RuntimeSettings> {
  return parseSettings(await redis.get(SETTINGS_KEY)) ?? inMemorySettings;
}

export async function saveRuntimeSettings(settings: RuntimeSettings): Promise<void> {
  const json = JSON.stringify(settings);
  await redis.multi().set(SETTINGS_KEY, json).publish(CHANNEL, json).exec();
  inMemorySettings = settings;
}

export function getDefaultRuntimeSettings(): RuntimeSettings {
  return { ...defaultSettings };
}
