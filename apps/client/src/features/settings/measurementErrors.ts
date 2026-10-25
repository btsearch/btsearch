import type { MeasurementUploadConflict } from "@openbts/shared/contract";
import i18next from "i18next";
import { toast } from "sonner";

import { ApiResponseError, showApiError } from "@/lib/api";

type UploadErrorKind = MeasurementUploadConflict["kind"] | "fileDeleted";

const UPLOAD_CONFLICT_KINDS: readonly MeasurementUploadConflict["kind"][] = ["excluded", "withdrawn", "notExcluded"];

function readConflictKind(details: readonly unknown[] | undefined): MeasurementUploadConflict["kind"] | null {
  for (const detail of details ?? []) {
    if (typeof detail !== "object" || detail === null || !("kind" in detail)) continue;
    const kind = UPLOAD_CONFLICT_KINDS.find((candidate) => candidate === detail.kind);
    if (kind !== undefined) return kind;
  }
  return null;
}

function readUploadErrorKind(error: unknown): UploadErrorKind | null {
  if (!(error instanceof ApiResponseError)) return null;
  const serverError = error.errors[0];
  if (serverError?.code === "GONE") return "fileDeleted";
  return serverError?.code === "CONFLICT" ? readConflictKind(serverError.details) : null;
}

export function showUploadError(error: unknown): void {
  const kind = readUploadErrorKind(error);
  if (kind === null) showApiError(error);
  else toast.error(i18next.t("common:error.actionFailed"), { description: i18next.t(`settings:measurements.uploads.errors.${kind}`) });
}
