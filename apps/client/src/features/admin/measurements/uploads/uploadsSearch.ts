import { MEASUREMENT_UPLOAD_STATUSES, type MeasurementUploadStatus } from "@openbts/shared/contract";

import { parseUserId } from "@/features/admin/users/utils/userId";
import { listSearchValues } from "@/lib/urlSearch";

export type UploadsSearch = {
  statuses?: string;
  userId?: string;
};

export type UploadsCriteria = {
  statuses: readonly MeasurementUploadStatus[];
  userId: string | null;
};

function listStatuses(value: unknown): MeasurementUploadStatus[] {
  const requestedStatuses = new Set(listSearchValues(value));
  return MEASUREMENT_UPLOAD_STATUSES.filter((status) => requestedStatuses.has(status));
}

function joinStatuses(statuses: readonly MeasurementUploadStatus[]): string | undefined {
  return statuses.length > 0 ? statuses.join(",") : undefined;
}

export function parseUploadsSearch(search: Record<string, unknown>): UploadsSearch {
  return {
    statuses: joinStatuses(listStatuses(search.statuses)),
    userId: parseUserId(search.userId),
  };
}

export function readUploadsCriteria(search: UploadsSearch): UploadsCriteria {
  return {
    statuses: listStatuses(search.statuses),
    userId: parseUserId(search.userId) ?? null,
  };
}

export function toUploadsSearch(criteria: UploadsCriteria): UploadsSearch {
  return {
    statuses: joinStatuses(MEASUREMENT_UPLOAD_STATUSES.filter((status) => criteria.statuses.includes(status))),
    userId: criteria.userId ?? undefined,
  };
}

export function countActiveUploadFilters(criteria: UploadsCriteria): number {
  return Number(criteria.statuses.length > 0) + Number(criteria.userId !== null);
}
