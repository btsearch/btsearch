import type { StructureType } from "@openbts/shared/contract";

export type OwnerChoice = { kind: "unknown" } | { kind: "listed"; ownerId: number } | { kind: "proposed"; name: string };

export type StructureDraft = {
  type: StructureType | null;
  owner: OwnerChoice;
  note: string;
};
