import { devices, observedCells, uploadFolds, uploads } from "@openbts/drizzle";
import { type SQL, type SQLWrapper, and, countDistinct, eq, inArray, isNull, lt, notExists, notInArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import db from "../../../database/psql.js";
import type { StoredUpload, UploadFoldRow, UploadRow } from "./read.js";

const UNCOUNTED_STATUSES = new Set<UploadRow["status"]>(["withdrawn", "excluded"]);

export function countedFold({ upload, fold }: StoredUpload): UploadFoldRow | null {
  if (fold === null || fold.unfoldedAt !== null || UNCOUNTED_STATUSES.has(upload.status)) return null;
  return fold;
}

export function isCountedUpload(): SQL | undefined {
  return and(isNull(uploadFolds.unfoldedAt), notInArray(uploads.status, [...UNCOUNTED_STATUSES]));
}

export function selectCountedUploadIds(userId: string) {
  return db
    .select({ id: uploads.id })
    .from(uploads)
    .innerJoin(devices, eq(devices.id, uploads.deviceId))
    .innerJoin(uploadFolds, eq(uploadFolds.uploadId, uploads.id))
    .where(and(eq(devices.userId, userId), isCountedUpload()));
}

export function isFirstCellOfItsSite(): SQL {
  const earlierCell = alias(observedCells, "earlier_cell");
  const earlierCellOfSite = db
    .select({ id: earlierCell.id })
    .from(earlierCell)
    .where(and(eq(earlierCell.observedSiteId, observedCells.observedSiteId), lt(earlierCell.id, observedCells.id)));
  return notExists(earlierCellOfSite);
}

export function countSitesFoundFirst(uploadIds: readonly string[] | SQLWrapper) {
  return db
    .select({ uploadId: observedCells.firstUploadId, count: countDistinct(observedCells.observedSiteId) })
    .from(observedCells)
    .where(and(inArray(observedCells.firstUploadId, uploadIds), isFirstCellOfItsSite()))
    .groupBy(observedCells.firstUploadId);
}
