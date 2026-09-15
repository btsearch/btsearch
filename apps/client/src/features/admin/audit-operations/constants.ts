import { AUDIT_ENTITIES, AUDIT_OPERATION_KINDS } from "@openbts/shared/audit";

const KIND_GROUP_ORDER = [
  "station",
  "cells",
  "location",
  "submission",
  "comment",
  "operator",
  "band",
  "region",
  "list",
  "settings",
  "uke",
  "analyzer",
  "system",
  "revert",
];

export const KIND_GROUPS = KIND_GROUP_ORDER.flatMap((key) => {
  const kinds = AUDIT_OPERATION_KINDS.filter((kind) => (key === "revert" ? kind === "revert" : kind.startsWith(`${key}.`)));
  return kinds.length > 0 ? [{ key, kinds }] : [];
});

export const ENTITY_OPTIONS = AUDIT_ENTITIES;
