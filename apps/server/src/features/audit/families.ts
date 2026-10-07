import type { AuditOperationKind } from "@openbts/shared/audit";

type FamilyPlace = { family: number; rank: number };

const OPERATION_FAMILIES: readonly (readonly AuditOperationKind[])[] = [
  [
    "station.create",
    "station.edit",
    "cells.create",
    "cells.update",
    "cells.delete",
    "location.create",
    "location.edit",
    "station.photos",
    "location.photos",
  ],
  ["submission.approve", "submission.reject", "submission.create", "submission.delete", "submission.update", "submission.photos"],
  ["analyzer.apply"],
  ["brand.create", "brand.update"],
  ["band.create", "country.bands"],
];

const PLACE_BY_KIND = new Map<AuditOperationKind, FamilyPlace>(
  OPERATION_FAMILIES.flatMap((kinds, family) => kinds.map((kind, rank): [AuditOperationKind, FamilyPlace] => [kind, { family, rank }])),
);

export function hasOperationFamily(kind: AuditOperationKind): boolean {
  return PLACE_BY_KIND.has(kind);
}

export function leadingKind(stored: AuditOperationKind, joining: AuditOperationKind): AuditOperationKind | null {
  const storedPlace = PLACE_BY_KIND.get(stored);
  const joiningPlace = PLACE_BY_KIND.get(joining);
  if (storedPlace === undefined || joiningPlace === undefined || storedPlace.family !== joiningPlace.family) return null;
  return joiningPlace.rank < storedPlace.rank ? joining : stored;
}
