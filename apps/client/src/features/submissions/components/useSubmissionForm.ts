import type { Submission, SubmissionCreate, SubmissionUpdate } from "@openbts/shared/contract";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { NO_PHOTO_PICKS, type PhotoDraft, toPhotoPicks, usePhotoDraft } from "./hooks/usePhotoDraft";
import { trackPhotoUpload } from "@/components/photos/photoUploadToast";
import type { StationRecord } from "@/features/station-details/station/types";
import { getStationCountryCode } from "@/features/station-details/station/utils/stations";
import { submissionPhotosQueryOptions, uploadSubmissionPhotos } from "@/features/station-editing/data/submissionPhotos";
import {
  createSubmissions,
  invalidateSubmissionQueries,
  storeSubmission,
  updateSubmission,
  withdrawSubmission,
} from "@/features/station-editing/data/submissions";
import { useBlockedSaves, useStationDraft } from "@/features/station-editing/hooks/useStationDraft";
import { type PhotoPicks, buildSubmissionCreate, buildSubmissionUpdate, isSamePicks } from "@/features/station-editing/model/bodies";
import { buildPhotoChanges, normalizeText } from "@/features/station-editing/model/changes";
import type { SessionInput } from "@/features/station-editing/model/draftReducer";
import { isServerRefusal, toEditErrors } from "@/features/station-editing/model/serverRefusals";
import { toProposedSnapshot, toStationSnapshot } from "@/features/station-editing/model/snapshots";
import type { BuiltBody, EditError, StationSnapshot } from "@/features/station-editing/model/types";
import { NO_EDIT_ERRORS, listShownErrors, validateSubmissionExtras } from "@/features/station-editing/model/validate";
import { type AuditOperationHandle, createAuditOperationHandle, showApiError } from "@/lib/api";
import { photoQualityErrorKey } from "@/lib/photoUploadError";

export type SubmissionSeed = {
  station: StationRecord | null;
  submission: Submission | null;
  prefill: StationSnapshot | null;
  note: string;
};

type PhotoUploads = {
  files: readonly File[];
  notes: readonly string[];
  takenAts: readonly (Date | null)[];
  mainIndex: number | null;
};

type UploadMessages = {
  success: string;
  error: (error: unknown) => string;
};

type NewSubmissionRequest = {
  kind: "create";
  built: BuiltBody<SubmissionCreate[]>;
  items: readonly SubmissionCreate[];
  uploads: PhotoUploads;
  messages: UploadMessages;
};

type StoredSubmissionRequest = {
  kind: "update";
  submissionId: string;
  built: BuiltBody<SubmissionUpdate>;
  uploads: PhotoUploads;
  messages: UploadMessages;
};

type SendRequest = NewSubmissionRequest | StoredSubmissionRequest;

type SendResult = {
  submission: Submission | null;
  isWithdrawn: boolean;
  areUploadsSent: boolean;
};

const NO_UPLOADS: PhotoUploads = { files: [], notes: [], takenAts: [], mainIndex: null };
const NOTHING_TO_SEND: EditError = { target: { scope: "general", field: "changes" }, messageKey: "submissions:form.nothingChanged" };

function createSessionInput({ station, submission, prefill }: SubmissionSeed): SessionInput {
  const live = station === null ? null : toStationSnapshot(station);
  const countryCode = station === null ? null : getStationCountryCode(station);

  if (submission !== null) return { kind: "form", action: submission.action, countryCode, live, proposed: toProposedSnapshot(live, submission) };
  if (live !== null) return { kind: "form", action: "update", countryCode, live, proposed: null };

  const input: SessionInput = { kind: "form", action: "create", countryCode, live, proposed: null };
  if (prefill !== null) input.initialDraft = prefill;
  return input;
}

function toStoredPicks(submission: Submission): PhotoPicks {
  const { selected, removed } = submission.changes.photos;

  return {
    selectIds: selected.map((photo) => photo.id),
    removeIds: removed.map((photo) => photo.id),
    mainPhotoId: selected.find((photo) => photo.isMain)?.id ?? null,
  };
}

function countPhotoChanges(draft: PhotoDraft): number {
  const photoChanges = buildPhotoChanges({
    addedCount: draft.photos.length,
    shownCount: draft.locationPhotoIds.length,
    hiddenCount: draft.locationPhotoIdsToRemove.length,
    hasNewMainPhoto: draft.mainLocationPhotoId !== null || draft.mainUploadPhotoIndex !== null,
  });
  return photoChanges.length;
}

function standsWithoutPhotos(item: SubmissionCreate | undefined): boolean {
  if (item === undefined || item.action === "delete") return true;

  const hasCells = (item.cells?.length ?? 0) > 0;
  if (item.action === "create") return hasCells;

  const hasSectors = (item.sectors?.length ?? 0) > 0;
  const hasPicks = (item.photos?.selectIds?.length ?? 0) > 0 || (item.photos?.removeIds?.length ?? 0) > 0;
  return item.station !== undefined || item.location !== undefined || hasSectors || hasCells || hasPicks;
}

async function uploadDraftPhotos(
  submissionId: string,
  uploads: PhotoUploads,
  messages: UploadMessages,
  auditOperation: AuditOperationHandle,
): Promise<boolean> {
  if (uploads.files.length === 0) return true;

  const { files, notes, takenAts, mainIndex } = uploads;
  try {
    await trackPhotoUpload(
      (onProgress) => uploadSubmissionPhotos(submissionId, files, { notes, takenAts, mainIndex, onProgress, auditOperation }),
      messages,
    );
    return true;
  } catch {
    return false;
  }
}

async function sendNewSubmission({ items, uploads, messages }: NewSubmissionRequest): Promise<SendResult> {
  const auditOperation = createAuditOperationHandle();
  const [submission] = await createSubmissions(items, auditOperation);
  if (submission === undefined) throw new Error("The server created no submission");

  const areUploadsSent = await uploadDraftPhotos(submission.id, uploads, messages, auditOperation);
  if (areUploadsSent || standsWithoutPhotos(items.at(0))) return { submission, isWithdrawn: false, areUploadsSent };

  await withdrawSubmission(submission.id, auditOperation).catch(() => undefined);
  return { submission, isWithdrawn: true, areUploadsSent };
}

async function sendStoredSubmission({ submissionId, built, uploads, messages }: StoredSubmissionRequest): Promise<SendResult> {
  const auditOperation = createAuditOperationHandle();
  const submission = built.body === null ? null : await updateSubmission(submissionId, built.body, auditOperation);
  const areUploadsSent = await uploadDraftPhotos(submissionId, uploads, messages, auditOperation);
  return { submission, isWithdrawn: false, areUploadsSent };
}

function sendSubmission(request: SendRequest): Promise<SendResult> {
  return request.kind === "create" ? sendNewSubmission(request) : sendStoredSubmission(request);
}

export function useSubmissionForm(seed: SubmissionSeed) {
  const { t } = useTranslation("submissions");
  const queryClient = useQueryClient();
  const [input] = useState(() => createSessionInput(seed));
  const [stored, setStored] = useState(seed.submission);
  const [note, setNote] = useState(seed.submission === null ? seed.note : (seed.submission.note ?? ""));
  const [isSent, setIsSent] = useState(false);
  const isSendStarted = useRef(false);
  const photoDraft = usePhotoDraft(seed.submission === null ? NO_PHOTO_PICKS : toStoredPicks(seed.submission));
  const sendMutation = useMutation({
    mutationFn: sendSubmission,
    onSettled: () => {
      isSendStarted.current = false;
      void invalidateSubmissionQueries(queryClient, stored?.id);
    },
  });
  const storedPhotosQuery = useQuery({ ...submissionPhotosQueryOptions(stored?.id ?? ""), enabled: stored !== null });
  const edit = useStationDraft({ ...input, canEdit: !sendMutation.isPending && !isSent && (stored === null || stored.status === "pending") });
  const { blockedSaves, countBlockedSave, reportBlockedSave } = useBlockedSaves(edit.dispatch);

  const { session } = edit;
  const isSending = sendMutation.isPending;
  const isReadOnly = stored !== null && stored.status !== "pending";
  const isDelete = session.action === "delete";
  const picks = toPhotoPicks(photoDraft);
  const storedPicks = stored === null ? NO_PHOTO_PICKS : toStoredPicks(stored);
  const storedUploadCount = storedPhotosQuery.data?.length ?? stored?.changes.photos.uploadedCount ?? 0;
  const extraErrors = validateSubmissionExtras({
    session,
    note,
    uploads: photoDraft.photos,
    storedUploadCount,
    selectIds: picks.selectIds,
    removeIds: picks.removeIds,
    mainPhotoId: picks.mainPhotoId,
  });
  const errors = [...edit.errors, ...listShownErrors(extraErrors, session.isSaveAttempted)];
  const isNoteChanged = normalizeText(note) !== normalizeText(stored?.note ?? "");
  const storedChangeCount =
    edit.corrections.length + (photoDraft.photos.length > 0 ? 1 : 0) + (isSamePicks(picks, storedPicks) ? 0 : 1) + (isNoteChanged ? 1 : 0);
  const pendingCount = stored === null ? edit.changes.length + countPhotoChanges(photoDraft) : storedChangeCount;
  const canSend = edit.canEdit && (pendingCount > 0 || (stored === null && isDelete));
  const isDirty = !isSent && (isSending || pendingCount > 0 || isNoteChanged || (stored === null && isDelete));

  function buildRequest(): SendRequest | null {
    const messages: UploadMessages = { success: t("photos.uploaded"), error: (error) => t(photoQualityErrorKey(error) ?? "photos.uploadFailed") };
    const uploads: PhotoUploads = isDelete
      ? NO_UPLOADS
      : { files: photoDraft.photos, notes: photoDraft.notes, takenAts: photoDraft.takenAts, mainIndex: photoDraft.mainUploadPhotoIndex };

    if (stored !== null) {
      const built = buildSubmissionUpdate(session, { note: { value: note, stored: stored.note }, picks: { value: picks, stored: storedPicks } });
      if (built.body === null && uploads.files.length === 0) return null;
      return { kind: "update", submissionId: stored.id, built, uploads, messages };
    }

    const built = buildSubmissionCreate(session, { stationId: seed.station?.id ?? null, note, uploadCount: uploads.files.length, picks });
    return built.body === null ? null : { kind: "create", built, items: built.body, uploads, messages };
  }

  function finishSend(result: SendResult, request: SendRequest) {
    if (request.kind === "create") {
      if (result.isWithdrawn) return;
      setIsSent(true);
      toast.success(t("toast.submitted"));
      return;
    }

    if (result.submission !== null) {
      const { live } = session;
      storeSubmission(queryClient, result.submission);
      setStored(result.submission);
      edit.dispatch({ type: "rebase", live, proposed: toProposedSnapshot(live, result.submission) });
    }
    if (result.areUploadsSent) photoDraft.clearUploads();
    if (result.submission !== null || result.areUploadsSent) toast.success(t("toast.updated"));
  }

  function failSend(error: unknown, request: SendRequest) {
    if (!isServerRefusal(error)) {
      showApiError(error);
      return;
    }
    edit.setServerErrors(toEditErrors(error, request.built, session));
    countBlockedSave();
  }

  function send() {
    if (!canSend || isSendStarted.current) return;
    if (edit.hasErrors || extraErrors.length > 0) {
      reportBlockedSave();
      return;
    }

    const request = buildRequest();
    if (request === null) {
      edit.setServerErrors([NOTHING_TO_SEND]);
      countBlockedSave();
      return;
    }
    if (session.serverErrors.length > 0) edit.setServerErrors(NO_EDIT_ERRORS);
    isSendStarted.current = true;
    sendMutation.mutate(request, { onSuccess: finishSend, onError: failSend });
  }

  return {
    edit,
    photoDraft,
    stored,
    note,
    setNote,
    errors,
    blockedSends: blockedSaves,
    pendingCount,
    isSent,
    isSending,
    isReadOnly,
    isDirty,
    canSend,
    send,
  };
}
