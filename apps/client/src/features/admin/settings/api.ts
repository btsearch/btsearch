import type { RejectedPhotoRemoval, Settings, SettingsUpdate } from "@openbts/shared/contract";

import { JSON_HEADERS, fetchV2Data } from "@/lib/api";

export function updateSiteSettings(update: SettingsUpdate): Promise<Settings> {
  return fetchV2Data<Settings>("settings", { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(update) });
}

export function removeRejectedSubmissionPhotos(): Promise<RejectedPhotoRemoval> {
  return fetchV2Data<RejectedPhotoRemoval>("submissions/rejected-photos", { method: "DELETE" });
}
