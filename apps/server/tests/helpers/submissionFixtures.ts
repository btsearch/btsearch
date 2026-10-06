import { dbMock } from "./boundaries.js";

export const submitterId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const submissionId = "11111111-1111-4111-8111-111111111111";
export const submissionRow = {
  id: submissionId,
  submitter_id: submitterId,
  reviewer_id: null,
  station_id: null,
  type: "new" as const,
  status: "pending" as const,
  origin: "manual" as const,
  submitter_note: null,
  review_notes: "Earlier note",
  pending_photos: null,
  country_code: null,
  reviewed_at: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

export function scriptSubmissionSerialization(role = "user") {
  for (const table of [
    "proposed_stations",
    "proposed_locations",
    "proposed_sectors",
    "proposed_cells",
    "submission_location_photo_selections",
    "submission_photos",
  ])
    dbMock.enqueueFor("select", table, []);
  dbMock.enqueueFor("select", "users", [], [{ role }]);
  dbMock.enqueueFor("select", "role_grants", []);
}

type StampedPlacement = { stationId?: number | null; regionId?: number | null; operatorId?: number | null };

export function scriptCountryStamp(placement: StampedPlacement = {}, countryCode: string | null = "PL") {
  const { stationId = null, regionId = null, operatorId = null } = placement;
  dbMock.enqueueFor("select", "submissions", [{ stationId, regionId, operatorId }]);
  if (regionId !== null) dbMock.enqueueFor("select", "regions", [{ countryCode }]);
  if (stationId !== null) dbMock.enqueueFor("select", "stations", [{ locationCountry: countryCode, operatorCountry: countryCode }]);
  if (operatorId !== null) dbMock.enqueueFor("select", "operators", [{ countryCode }]);
  dbMock.enqueueFor("update", "submissions", []);
}
