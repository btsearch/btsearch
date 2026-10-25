import type { NewCellInput } from "@openbts/shared/contract";

import { type CellRows, DATABASE_RATS } from "../../src/features/stations/serialize.js";
import { dbMock } from "./boundaries.js";
import { storedCell } from "./cellWriteFixtures.js";

type Grant = { countryCode: string; grantRole: "editor" | "maintainer"; isCountryWide: boolean; regionId: number | null };

export const EDITOR_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
export const REGIONAL_GRANT: Grant = { countryCode: "PL", grantRole: "editor", isCountryWide: false, regionId: 7 };

const raisedAt = new Date("2026-10-30T12:00:00.000Z");

export const pciFlagRow = {
  id: 4101,
  kind: "valueDiffers",
  subjectKey: "cell:880345:pci",
  observedSiteId: 9205,
  observedCellId: 50411,
  stationId: 40077,
  cellId: 880345,
  sectorId: null,
  countryCode: null,
  regionId: null,
  bandId: null,
  deviceId: null,
  userId: null,
  readerVersionId: null,
  deviceModelId: null,
  evidence: { field: "pci", observed: 301, stored: 214, samples: 46, people: 2, lastSeenOn: "2026-10-30" },
  suggestion: { cells: [{ action: "update", id: 880345, pci: 301 }] },
  measure: { value: 301, people: 2 },
  createdAt: raisedAt,
  updatedAt: raisedAt,
  closedReason: null as "applied" | "fixedElsewhere" | "evidenceGone" | "dismissed" | null,
  dismissedReason: null as "notAnIssue" | "cannotVerify" | "needsSurvey" | null,
  resolvedAt: null as Date | null,
  resolvedById: null as string | null,
  note: null as string | null,
};

export const bandFlagRow = {
  ...pciFlagRow,
  id: 4201,
  kind: "bandNotInPlan",
  subjectKey: "country:PL:band:41",
  observedSiteId: null,
  observedCellId: null,
  stationId: null,
  cellId: null,
  countryCode: "PL",
  bandId: 41,
  evidence: { rat: "nr", channels: [636666], samples: 120, people: 3, lastSeenOn: "2026-10-29" },
  suggestion: { bandId: 41 },
  measure: { channels: [636666], people: 3 },
};

export function listedFlag(flag: Record<string, unknown> = pciFlagRow, overrides: Record<string, unknown> = {}) {
  return { flag, countryCode: "PL", regionId: 7, resolver: null, person: null, key: null, ...overrides };
}

export function storedCellRows(input: NewCellInput, id: number, stationId: number): CellRows {
  const { cell, gsm, umts, lte, nr } = storedCell({ ...input, cellType: null }, id, stationId);
  return { cell: { ...cell, rat: DATABASE_RATS[input.rat], type: null }, gsm, umts, lte, nr };
}

export function scriptAccess(role: "editor" | "admin", grants: Grant[] = []) {
  dbMock.enqueueFor("select", "users", [{ role }]);
  dbMock.enqueueFor("select", "role_grants", grants);
}
