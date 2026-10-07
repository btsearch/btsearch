import type { Settings, SettingsAnnouncement, SettingsUpdate } from "@openbts/shared/contract";

import type { Announcement, RuntimeSettings, RuntimeSettingsPatch } from "../../lib/runtimeSettings.js";
import { keepExistingRouteRules } from "./routeRules.js";

type SettingsViewer = { isAdministrator: boolean };

function toAnnouncement({ enabled, type, message }: Announcement): SettingsAnnouncement {
  return { isEnabled: enabled, type, message };
}

export function toSettings(stored: RuntimeSettings, { isAdministrator }: SettingsViewer): Settings {
  const settings: Settings = {
    isMaintenanceMode: stored.maintenanceEnabled,
    isSignInRequired: stored.enforceAuthForAllRoutes,
    features: {
      submissions: stored.submissionsEnabled,
      photoUploads: stored.photosEnabled,
      comments: stored.enableStationComments,
      commentReview: stored.commentQueueEnabled,
      lists: stored.enableUserLists,
    },
    announcement: isAdministrator || stored.announcement.enabled ? toAnnouncement(stored.announcement) : null,
  };
  if (isAdministrator) {
    settings.access = {
      openRoutes: keepExistingRouteRules(stored.allowedUnauthenticatedRoutes),
      disabledRoutes: keepExistingRouteRules(stored.disabledRoutes),
    };
  }

  return settings;
}

export function toRuntimeSettingsPatch({
  isMaintenanceMode,
  isSignInRequired,
  features,
  announcement,
  access,
}: SettingsUpdate): RuntimeSettingsPatch {
  const patch: RuntimeSettingsPatch = {
    maintenanceEnabled: isMaintenanceMode,
    enforceAuthForAllRoutes: isSignInRequired,
    submissionsEnabled: features?.submissions,
    photosEnabled: features?.photoUploads,
    enableStationComments: features?.comments,
    commentQueueEnabled: features?.commentReview,
    enableUserLists: features?.lists,
    allowedUnauthenticatedRoutes: access?.openRoutes,
    disabledRoutes: access?.disabledRoutes,
  };
  if (announcement) patch.announcement = { enabled: announcement.isEnabled, type: announcement.type, message: announcement.message };

  return patch;
}
