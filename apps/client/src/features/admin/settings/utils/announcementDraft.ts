import type { SettingsAnnouncement } from "@openbts/shared/contract";

import { hasChanges, pickChanges } from "@/features/admin/reference/utils/diff";

export type AnnouncementEdits = Partial<SettingsAnnouncement>;

export const ANNOUNCEMENT_MESSAGE_MAX_LENGTH = 1000;

const ANNOUNCEMENT_FIELDS = ["isEnabled", "type", "message"] as const;

export function hasAnnouncementMessage(announcement: SettingsAnnouncement): boolean {
  return announcement.message.trim() !== "";
}

export function readAnnouncementDraft(saved: SettingsAnnouncement, edits: AnnouncementEdits) {
  const draft: SettingsAnnouncement = { ...saved, ...edits };
  const changes: AnnouncementEdits = pickChanges(saved, draft, ANNOUNCEMENT_FIELDS);

  return {
    draft,
    changes,
    isDirty: hasChanges(changes),
    isMessageMissing: draft.isEnabled && !hasAnnouncementMessage(draft),
    isMessageTooLong: draft.message.length > ANNOUNCEMENT_MESSAGE_MAX_LENGTH,
  };
}

export function dropSavedEdits(edits: AnnouncementEdits, savedChanges: AnnouncementEdits): AnnouncementEdits {
  const unsavedEdits: AnnouncementEdits = {};
  for (const field of ANNOUNCEMENT_FIELDS) {
    const edit = edits[field];
    if (edit !== undefined && edit !== savedChanges[field]) Object.assign(unsavedEdits, { [field]: edit });
  }
  return unsavedEdits;
}
