export const AUDIT_OPERATION_KINDS = [
  "station.create",
  "station.edit",
  "station.delete",
  "station.photos",
  "cells.create",
  "cells.update",
  "cells.delete",
  "location.create",
  "location.edit",
  "location.delete",
  "location.photos",
  "submission.create",
  "submission.update",
  "submission.delete",
  "submission.approve",
  "submission.reject",
  "submission.cleanup",
  "submission.photos",
  "analyzer.apply",
  "comment.create",
  "comment.update",
  "comment.delete",
  "operator.create",
  "operator.update",
  "operator.delete",
  "band.create",
  "band.update",
  "band.delete",
  "region.create",
  "region.update",
  "region.delete",
  "list.create",
  "list.update",
  "list.delete",
  "settings.update",
  "uke.import",
  "system.inactive_cleanup",
  "system.submission_cleanup",
  "revert",
] as const;

export type AuditOperationKind = (typeof AUDIT_OPERATION_KINDS)[number];

export const CLIENT_SETTABLE_KINDS = [
  "station.create",
  "station.edit",
  "station.photos",
  "location.edit",
] as const satisfies readonly AuditOperationKind[];

export type ClientSettableAuditOperationKind = (typeof CLIENT_SETTABLE_KINDS)[number];

export const AUDIT_ENTITIES = [
  "stations",
  "cells",
  "locations",
  "station_sectors",
  "extra_identificators",
  "station_photo_selections",
  "location_photos",
  "station_comments",
  "submissions",
  "submission_photos",
  "operators",
  "bands",
  "regions",
  "user_lists",
  "settings",
] as const;

export type AuditEntity = (typeof AUDIT_ENTITIES)[number];

export const AUDIT_OPS = ["create", "update", "delete"] as const;

export type AuditOp = (typeof AUDIT_OPS)[number];

export const AUDIT_SOURCES = ["api", "import", "system"] as const;

export type AuditSource = (typeof AUDIT_SOURCES)[number];

export const AUDIT_OPERATION_ID_HEADER = "x-audit-operation-id";
export const AUDIT_OPERATION_KIND_HEADER = "x-audit-operation-kind";
