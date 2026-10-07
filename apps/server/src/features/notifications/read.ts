import { locations, notifications, operators, stations, submissions, ukeLocations, ukeStations, users } from "@openbts/drizzle";
import { MAX_ID } from "@openbts/shared/contract";
import type { Notification, NotificationSite, SubmissionAction, UserRef } from "@openbts/shared/contract";
import { eq, inArray, or } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import { z } from "zod/v4";

import db from "../../database/psql.js";
import { unique } from "../../lib/collections.js";
import { type UserRefViewer, toPublicUserRef } from "../users/userRef.js";
import { type MapCoordinates, parseActionUrlCoordinates } from "./actionUrls.js";

const notificationSelectSchema = createSelectSchema(notifications, { metadata: z.record(z.string(), z.unknown()).nullable() });

type NotificationRow = z.infer<typeof notificationSelectSchema>;
type Metadata = Record<string, unknown>;
type SiteDetails = { siteId: string | null; operatorId: number | null; location: MapCoordinates | null };
type SiteRow = { id: number; siteId: string | null; operatorId: number | null; latitude: number | null; longitude: number | null };
type Sites = { stations: Map<number, SiteDetails>; officialSites: Map<number, SiteDetails> };
type SubmissionDetails = { type: string; submitterId: string | null; reviewerId: string | null };
type OperatorLabel = { mnc: number | null; name: string | null };
type OperatorRow = { id: number; name: string; mnc: number | null };
type LabelledOperators = { byMnc: Map<number, OperatorRow>; byName: Map<string, OperatorRow[]> };

const ACTIONS: Partial<Record<string, SubmissionAction>> = { new: "create", update: "update", delete: "delete" };

function toText(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function toOperatorNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && Math.abs(value) <= MAX_ID ? value : null;
}

function toOperatorLabel(metadata: Metadata): OperatorLabel {
  return { mnc: toOperatorNumber(metadata.station_operator_mnc), name: toText(metadata.station_operator_name) };
}

function toSiteDetails({ siteId, operatorId, latitude, longitude }: SiteRow): SiteDetails {
  return { siteId, operatorId, location: latitude === null || longitude === null ? null : { latitude, longitude } };
}

function toSite(id: number | null, live: SiteDetails | undefined, stored: SiteDetails): NotificationSite | null {
  const siteId = live?.siteId ?? stored.siteId;
  const operatorId = live ? live.operatorId : stored.operatorId;
  const location = live?.location ?? stored.location;
  if (id === null && siteId === null && operatorId === null && location === null) return null;
  return { id, siteId, operatorId, location };
}

function hasLiveSite(row: NotificationRow, sites: Sites): boolean {
  if (row.stationId !== null) return sites.stations.has(row.stationId);
  return row.ukeStationId !== null && sites.officialSites.has(row.ukeStationId);
}

function findLabelledOperatorId({ byMnc, byName }: LabelledOperators, { mnc, name }: OperatorLabel): number | null {
  const numbered = mnc === null ? undefined : byMnc.get(mnc);
  if (numbered) return numbered.id;

  const namesakes = name === null ? [] : (byName.get(name) ?? []);
  return namesakes.length === 1 ? (namesakes[0]?.id ?? null) : null;
}

async function loadSubmissions(rows: readonly NotificationRow[]): Promise<Map<string, SubmissionDetails>> {
  const submissionIds = unique(rows.map((row) => row.submissionId));
  if (submissionIds.length === 0) return new Map();

  const found = await db
    .select({ id: submissions.id, type: submissions.type, submitterId: submissions.submitter_id, reviewerId: submissions.reviewer_id })
    .from(submissions)
    .where(inArray(submissions.id, submissionIds));
  return new Map(found.map(({ id, ...details }) => [id, details]));
}

async function loadPeople(userIds: readonly string[], viewer: UserRefViewer): Promise<Map<string, UserRef>> {
  if (userIds.length === 0) return new Map();

  const rows = await db
    .select({ id: users.id, username: users.username, name: users.name, image: users.image, profileVisibility: users.profileVisibility })
    .from(users)
    .where(inArray(users.id, [...userIds]));
  return new Map(rows.map((user) => [user.id, toPublicUserRef(user, viewer)]));
}

async function loadSites(rows: readonly NotificationRow[]): Promise<Sites> {
  const stationIds = unique(rows.map((row) => row.stationId));
  const officialSiteIds = unique(rows.map((row) => row.ukeStationId));

  const [stationRows, officialSiteRows] = await Promise.all([
    stationIds.length > 0
      ? db
          .select({
            id: stations.id,
            siteId: stations.station_id,
            operatorId: stations.operator_id,
            latitude: locations.latitude,
            longitude: locations.longitude,
          })
          .from(stations)
          .leftJoin(locations, eq(locations.id, stations.location_id))
          .where(inArray(stations.id, stationIds))
      : [],
    officialSiteIds.length > 0
      ? db
          .select({
            id: ukeStations.id,
            siteId: ukeStations.station_id,
            operatorId: ukeStations.operator_id,
            latitude: ukeLocations.latitude,
            longitude: ukeLocations.longitude,
          })
          .from(ukeStations)
          .leftJoin(ukeLocations, eq(ukeLocations.id, ukeStations.location_id))
          .where(inArray(ukeStations.id, officialSiteIds))
      : [],
  ]);

  return {
    stations: new Map(stationRows.map((row) => [row.id, toSiteDetails(row)])),
    officialSites: new Map(officialSiteRows.map((row) => [row.id, toSiteDetails(row)])),
  };
}

async function loadLabelledOperators(labels: readonly OperatorLabel[]): Promise<LabelledOperators> {
  const mncs = unique(labels.map((label) => label.mnc));
  const names = unique(labels.map((label) => label.name));
  if (mncs.length === 0 && names.length === 0) return { byMnc: new Map(), byName: new Map() };

  const found: OperatorRow[] = await db
    .select({ id: operators.id, name: operators.name, mnc: operators.mnc })
    .from(operators)
    .where(or(mncs.length > 0 ? inArray(operators.mnc, mncs) : undefined, names.length > 0 ? inArray(operators.name, names) : undefined));

  return {
    byMnc: new Map(found.flatMap((operator) => (operator.mnc === null ? [] : [[operator.mnc, operator] as const]))),
    byName: Map.groupBy(found, (operator) => operator.name),
  };
}

export async function serializeNotifications(rows: readonly NotificationRow[], viewer: UserRefViewer): Promise<Notification[]> {
  if (rows.length === 0) return [];

  const [sites, submissionDetails] = await Promise.all([loadSites(rows), loadSubmissions(rows)]);
  const findSubmission = (row: NotificationRow) => (row.submissionId === null ? undefined : submissionDetails.get(row.submissionId));
  const personIds = rows.map((row) => {
    if (row.type === "new_submission") return findSubmission(row)?.submitterId ?? null;
    if (row.type === "submission_approved" || row.type === "submission_rejected") return findSubmission(row)?.reviewerId ?? null;
    return null;
  });
  const storedOperatorLabels = rows.filter((row) => !hasLiveSite(row, sites)).map((row) => toOperatorLabel(row.metadata ?? {}));
  const [people, labelledOperators] = await Promise.all([loadPeople(unique(personIds), viewer), loadLabelledOperators(storedOperatorLabels)]);

  return rows.map((row, index): Notification => {
    const metadata = row.metadata ?? {};
    const personId = personIds[index] ?? null;
    const person = personId === null ? null : (people.get(personId) ?? null);
    const stored: SiteDetails = {
      siteId: toText(metadata.station_id),
      operatorId: findLabelledOperatorId(labelledOperators, toOperatorLabel(metadata)),
      location: parseActionUrlCoordinates(row.actionUrl),
    };
    const station = toSite(row.stationId, row.stationId === null ? undefined : sites.stations.get(row.stationId), stored);
    const action = ACTIONS[String(metadata.submission_type)] ?? ACTIONS[findSubmission(row)?.type ?? ""] ?? null;
    const submission = row.submissionId === null ? null : { id: row.submissionId, action };
    const common = {
      id: row.id,
      isRead: row.readAt !== null,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      count: Math.max(1, toCount(metadata.count)),
    };

    switch (row.type) {
      case "submission_approved":
      case "submission_rejected": {
        const type = row.type === "submission_approved" ? "submissionAccepted" : "submissionRejected";
        return { ...common, type, submission, station, reviewer: person, reviewNote: toText(metadata.reviewer_note) };
      }
      case "new_submission":
        return { ...common, type: "submissionCreated", submission, station, submitter: person };
      case "submission_photo_upload_failed":
        return { ...common, type: "submissionPhotoUploadFailed", submission, station };
      case "station_cells_changed": {
        const cells = { added: toCount(metadata.added), removed: toCount(metadata.removed), updated: toCount(metadata.updated) };
        return { ...common, type: "stationCellsChanged", station, cells };
      }
      case "station_photos_added":
        return { ...common, type: "stationPhotosAdded", station };
      case "station_comment_approved":
        return { ...common, type: "stationCommentApproved", station };
      case "station_uke_permit_added": {
        const isOfficial = row.stationId === null;
        const liveOfficialSite = row.ukeStationId === null ? undefined : sites.officialSites.get(row.ukeStationId);
        return {
          ...common,
          type: "officialPermitsChanged",
          station: isOfficial ? null : station,
          officialSite: isOfficial ? toSite(row.ukeStationId, liveOfficialSite, stored) : null,
          permits: { added: toCount(metadata.permits_added), removed: toCount(metadata.permits_deleted) },
          officialSitesAdded: toCount(metadata.uke_stations_added),
          isRemovedFromRegister: metadata.uke_station_deleted === true,
        };
      }
    }
  });
}
