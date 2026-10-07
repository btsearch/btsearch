import {
  auditLogs,
  auditOperations,
  bands,
  cells,
  extraIdentificators,
  locationPhotos,
  lteCells,
  nrCells,
  operators,
  stationPhotoSelections,
  stationSectors,
  stations,
  submissions,
} from "@openbts/drizzle";
import db from "@openbts/drizzle/db";
import { type SQL, type SQLWrapper, and, count, eq, exists, gte, inArray, isNotNull, lt, notExists, or, sql } from "drizzle-orm";

import type { StatsOperator } from "../../features/stats/schemas.ts";

type MonthWindow = { startAt: SQL; endAt: SQL };
type StationCellGroup = { first_at: SQLWrapper; cells_total: SQLWrapper; cells_added: SQLWrapper };
type GroupCounts = { operator: StatsOperator; stations: number; stations_added: number; cells: number; cells_added: number };

type OperatorCounts = {
  stations: number;
  stations_added: number;
  cells: number;
  cells_added: number;
  pcis: number;
  pcis_added: number;
  azimuths: number;
  azimuths_added: number;
  networks_ids: number;
  networks_ids_added: number;
  photos: number;
  photos_added: number;
};

export type DatabaseMonthlyStats = {
  from: string | null;
  to: string | null;
  contributors: number;
  submissions: { submitted: number; approved: number; rejected: number };
  photos: { total: number; added: number };
  operators: (OperatorCounts & { operator: StatsOperator })[];
  bands: (GroupCounts & { band: { id: number; name: string; rat: string } })[];
  technologies: (GroupCounts & { technology: string })[];
};

function getMonthRange(month: string): { start: Date; end: Date } {
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end };
}

function timestamptz(date: Date): SQL {
  return sql`${date.toISOString()}::timestamptz`;
}

function pciOf(values: SQLWrapper): SQL {
  return sql`coalesce(${values}->'details'->>'pci', ${values}->'lte'->>'pci', ${values}->'nr'->>'pci')`;
}

function sectorsOf(values: SQLWrapper): SQL {
  return sql`case when jsonb_typeof(${values}) = 'array' then ${values} else '[]'::jsonb end`;
}

function countSectorsMissingFrom(sectors: SQLWrapper, reference: SQLWrapper): SQL<number> {
  return sql<number>`(select count(*)::int from jsonb_array_elements(${sectorsOf(sectors)}) as candidate(sector) where not exists (select 1 from jsonb_array_elements(${sectorsOf(reference)}) as known(sector) where known.sector->>'id' = candidate.sector->>'id'))`;
}

const gainedPci = sql`${pciOf(auditLogs.new_values)} is not null and ${pciOf(auditLogs.old_values)} is null`;
const gainedNetworksId = sql`${auditLogs.new_values}->>'networks_id' is not null and ${auditLogs.old_values}->>'networks_id' is null`;
const countedOperation = sql`${auditOperations.kind} <> 'revert' and ${auditOperations.reverted_by_operation_id} is null`;

function indexByOperator<T extends { operator_id: number | null }>(rows: readonly T[]): Map<number, T> {
  const index = new Map<number, T>();
  for (const row of rows) {
    if (row.operator_id !== null) index.set(row.operator_id, row);
  }
  return index;
}

function loadOperators() {
  return db.select({ id: operators.id, name: operators.name, mnc: operators.mnc }).from(operators);
}

function stationCellFields({ startAt, endAt }: MonthWindow): {
  first_at: SQL.Aliased<string>;
  cells_total: SQL.Aliased<number>;
  cells_added: SQL.Aliased<number>;
} {
  return {
    first_at: sql<string>`min(${cells.createdAt})`.as("first_at"),
    cells_total: sql<number>`count(*) filter (where ${cells.createdAt} < ${endAt})`.as("cells_total"),
    cells_added: sql<number>`count(*) filter (where ${cells.createdAt} >= ${startAt} and ${cells.createdAt} < ${endAt})`.as("cells_added"),
  };
}

function stationGroupCounts(
  group: StationCellGroup,
  { startAt, endAt }: MonthWindow,
): Record<"stations" | "stations_added" | "cells" | "cells_added", SQL<number>> {
  return {
    stations: sql<number>`(count(*) filter (where ${group.first_at} < ${endAt}))::int`,
    stations_added: sql<number>`(count(*) filter (where ${group.first_at} >= ${startAt} and ${group.first_at} < ${endAt}))::int`,
    cells: sql<number>`coalesce(sum(${group.cells_total}), 0)::int`,
    cells_added: sql<number>`coalesce(sum(${group.cells_added}), 0)::int`,
  };
}

function loadBandRows(range: MonthWindow) {
  const stationBands = db
    .select({ operator_id: stations.operator_id, band_id: cells.band_id, ...stationCellFields(range) })
    .from(cells)
    .innerJoin(stations, eq(stations.id, cells.station_id))
    .groupBy(stations.operator_id, cells.band_id, cells.station_id)
    .as("station_bands");

  return db
    .select({
      operator: { id: operators.id, name: operators.name, mnc: operators.mnc },
      band: { id: bands.id, name: bands.name, rat: bands.rat },
      ...stationGroupCounts(stationBands, range),
    })
    .from(stationBands)
    .innerJoin(operators, eq(operators.id, stationBands.operator_id))
    .innerJoin(bands, eq(bands.id, stationBands.band_id))
    .groupBy(operators.id, bands.id);
}

function loadTechnologyRows(range: MonthWindow) {
  const technology = sql<string>`case when ${bands.variant} = 'railway' then ${cells.rat}::text || '-R' else ${cells.rat}::text end`;
  const stationTechnologies = db
    .select({ operator_id: stations.operator_id, technology: technology.as("technology"), ...stationCellFields(range) })
    .from(cells)
    .innerJoin(stations, eq(stations.id, cells.station_id))
    .innerJoin(bands, eq(bands.id, cells.band_id))
    .groupBy(stations.operator_id, technology, cells.station_id)
    .as("station_technologies");

  return db
    .select({
      operator: { id: operators.id, name: operators.name, mnc: operators.mnc },
      technology: stationTechnologies.technology,
      ...stationGroupCounts(stationTechnologies, range),
    })
    .from(stationTechnologies)
    .innerJoin(operators, eq(operators.id, stationTechnologies.operator_id))
    .groupBy(operators.id, stationTechnologies.technology);
}

function loadSubmissionCounts({ startAt, endAt }: MonthWindow) {
  const reviewedInMonth = sql`${submissions.reviewed_at} >= ${startAt} and ${submissions.reviewed_at} < ${endAt}`;
  return db
    .select({
      submitted: sql<number>`(count(*) filter (where ${submissions.createdAt} >= ${startAt} and ${submissions.createdAt} < ${endAt}))::int`,
      approved: sql<number>`(count(*) filter (where ${submissions.status} = 'approved' and ${reviewedInMonth}))::int`,
      rejected: sql<number>`(count(*) filter (where ${submissions.status} = 'rejected' and ${reviewedInMonth}))::int`,
    })
    .from(submissions);
}

function loadContributors({ startAt, endAt }: MonthWindow) {
  const touchedData = db
    .select({ id: auditLogs.id })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.operation_id, auditOperations.id),
        inArray(auditLogs.entity, [
          "stations",
          "cells",
          "station_sectors",
          "extra_identificators",
          "locations",
          "location_photos",
          "station_photo_selections",
        ]),
      ),
    );

  return db
    .select({ contributors: sql<number>`count(distinct ${auditOperations.actor_id})::int` })
    .from(auditOperations)
    .where(
      and(
        gte(auditOperations.createdAt, startAt),
        lt(auditOperations.createdAt, endAt),
        eq(auditOperations.source, "api"),
        countedOperation,
        exists(touchedData),
      ),
    );
}

function loadStationRows({ startAt, endAt }: MonthWindow) {
  const stationFirstCells = db
    .select({
      operator_id: stations.operator_id,
      first_at: sql<string>`min(${cells.createdAt})`.as("first_at"),
    })
    .from(cells)
    .innerJoin(stations, eq(stations.id, cells.station_id))
    .groupBy(stations.id)
    .as("station_first_cells");

  return db
    .select({
      operator_id: stationFirstCells.operator_id,
      total: sql<number>`(count(*) filter (where ${stationFirstCells.first_at} < ${endAt}))::int`,
      added: sql<number>`(count(*) filter (where ${stationFirstCells.first_at} >= ${startAt} and ${stationFirstCells.first_at} < ${endAt}))::int`,
    })
    .from(stationFirstCells)
    .groupBy(stationFirstCells.operator_id);
}

function loadPciTotals({ endAt }: MonthWindow, excludeLaterGains: boolean) {
  const gainedAfterMonth = db
    .select({ id: auditLogs.id })
    .from(auditLogs)
    .where(and(eq(auditLogs.entity, "cells"), eq(auditLogs.record_id, sql`${cells.id}::text`), gte(auditLogs.createdAt, endAt), gainedPci));

  return db
    .select({ operator_id: stations.operator_id, total: count() })
    .from(cells)
    .innerJoin(stations, eq(stations.id, cells.station_id))
    .leftJoin(lteCells, eq(lteCells.cell_id, cells.id))
    .leftJoin(nrCells, eq(nrCells.cell_id, cells.id))
    .where(
      and(
        or(isNotNull(lteCells.pci), isNotNull(nrCells.pci)),
        lt(cells.createdAt, endAt),
        excludeLaterGains ? notExists(gainedAfterMonth) : undefined,
      ),
    )
    .groupBy(stations.operator_id);
}

function loadPciAdditions({ startAt, endAt }: MonthWindow) {
  return db
    .select({ operator_id: stations.operator_id, added: sql<number>`count(distinct ${auditLogs.record_id})::int` })
    .from(auditLogs)
    .innerJoin(auditOperations, eq(auditOperations.id, auditLogs.operation_id))
    .innerJoin(stations, eq(stations.id, auditLogs.station_id))
    .where(and(eq(auditLogs.entity, "cells"), gte(auditLogs.createdAt, startAt), lt(auditLogs.createdAt, endAt), countedOperation, gainedPci))
    .groupBy(stations.operator_id);
}

function loadSectorTotals() {
  return db
    .select({ operator_id: stations.operator_id, total: count() })
    .from(stationSectors)
    .innerJoin(stations, eq(stations.id, stationSectors.station_id))
    .groupBy(stations.operator_id);
}

function loadSectorChanges({ startAt, endAt }: MonthWindow) {
  const sectorChanges = db
    .select({
      operator_id: stations.operator_id,
      in_month: sql<boolean>`(${auditLogs.createdAt} < ${endAt})`.as("in_month"),
      counted: sql<boolean>`(${countedOperation})`.as("counted"),
      added: countSectorsMissingFrom(auditLogs.new_values, auditLogs.old_values).as("added"),
      removed: countSectorsMissingFrom(auditLogs.old_values, auditLogs.new_values).as("removed"),
    })
    .from(auditLogs)
    .innerJoin(auditOperations, eq(auditOperations.id, auditLogs.operation_id))
    .innerJoin(stations, eq(stations.id, auditLogs.station_id))
    .where(and(eq(auditLogs.entity, "station_sectors"), gte(auditLogs.createdAt, startAt)))
    .as("sector_changes");

  return db
    .select({
      operator_id: sectorChanges.operator_id,
      added: sql<number>`coalesce(sum(${sectorChanges.added}) filter (where ${sectorChanges.in_month} and ${sectorChanges.counted}), 0)::int`,
      added_later: sql<number>`coalesce(sum(${sectorChanges.added}) filter (where not ${sectorChanges.in_month}), 0)::int`,
      removed_later: sql<number>`coalesce(sum(${sectorChanges.removed}) filter (where not ${sectorChanges.in_month}), 0)::int`,
    })
    .from(sectorChanges)
    .groupBy(sectorChanges.operator_id);
}

function loadNetworksTotals() {
  return db
    .select({ operator_id: stations.operator_id, total: count() })
    .from(extraIdentificators)
    .innerJoin(stations, eq(stations.id, extraIdentificators.station_id))
    .where(isNotNull(extraIdentificators.networks_id))
    .groupBy(stations.operator_id);
}

function loadNetworksChanges({ startAt, endAt }: MonthWindow) {
  const networksChanges = db
    .select({
      operator_id: stations.operator_id,
      station_id: auditLogs.station_id,
      in_month: sql<boolean>`(${auditLogs.createdAt} < ${endAt})`.as("in_month"),
      counted: sql<boolean>`(${countedOperation})`.as("counted"),
    })
    .from(auditLogs)
    .innerJoin(auditOperations, eq(auditOperations.id, auditLogs.operation_id))
    .innerJoin(stations, eq(stations.id, auditLogs.station_id))
    .where(and(eq(auditLogs.entity, "extra_identificators"), gte(auditLogs.createdAt, startAt), gainedNetworksId))
    .as("networks_changes");

  return db
    .select({
      operator_id: networksChanges.operator_id,
      added: sql<number>`(count(distinct ${networksChanges.station_id}) filter (where ${networksChanges.in_month} and ${networksChanges.counted}))::int`,
      added_later: sql<number>`(count(distinct ${networksChanges.station_id}) filter (where not ${networksChanges.in_month}))::int`,
    })
    .from(networksChanges)
    .groupBy(networksChanges.operator_id);
}

function firstPhotoLinks() {
  return db
    .select({
      attachment_id: locationPhotos.attachment_id,
      added_at: sql<string>`min(${locationPhotos.createdAt})`.as("added_at"),
    })
    .from(locationPhotos)
    .groupBy(locationPhotos.attachment_id)
    .as("first_photo_links");
}

function loadPhotoTotals({ startAt, endAt }: MonthWindow) {
  const photos = firstPhotoLinks();
  return db
    .select({
      total: sql<number>`(count(*) filter (where ${photos.added_at} < ${endAt}))::int`,
      added: sql<number>`(count(*) filter (where ${photos.added_at} >= ${startAt} and ${photos.added_at} < ${endAt}))::int`,
    })
    .from(photos);
}

function loadPhotoRows({ startAt, endAt }: MonthWindow) {
  const photos = firstPhotoLinks();
  return db
    .select({
      operator_id: stations.operator_id,
      total: sql<number>`(count(distinct ${locationPhotos.attachment_id}) filter (where ${photos.added_at} < ${endAt}))::int`,
      added: sql<number>`(count(distinct ${locationPhotos.attachment_id}) filter (where ${photos.added_at} >= ${startAt} and ${photos.added_at} < ${endAt}))::int`,
    })
    .from(stationPhotoSelections)
    .innerJoin(stations, eq(stations.id, stationPhotoSelections.station_id))
    .innerJoin(locationPhotos, eq(locationPhotos.id, stationPhotoSelections.location_photo_id))
    .innerJoin(photos, eq(photos.attachment_id, locationPhotos.attachment_id))
    .groupBy(stations.operator_id);
}

export async function getDatabaseMonthlyStats(month: string, now: Date): Promise<DatabaseMonthlyStats> {
  const { start, end } = getMonthRange(month);
  if (start > now) {
    return {
      from: null,
      to: null,
      contributors: 0,
      submissions: { submitted: 0, approved: 0, rejected: 0 },
      photos: { total: 0, added: 0 },
      operators: [],
      bands: [],
      technologies: [],
    };
  }

  const range = { startAt: timestamptz(start), endAt: timestamptz(end) };
  const [
    operatorRows,
    bandRows,
    technologyRows,
    stationRows,
    pciTotalRows,
    pciAdditionRows,
    sectorTotalRows,
    sectorChangeRows,
    networksTotalRows,
    networksChangeRows,
    photoRows,
    photoTotalRows,
    submissionRows,
    contributorRows,
  ] = await Promise.all([
    loadOperators(),
    loadBandRows(range),
    loadTechnologyRows(range),
    loadStationRows(range),
    loadPciTotals(range, end <= now),
    loadPciAdditions(range),
    loadSectorTotals(),
    loadSectorChanges(range),
    loadNetworksTotals(),
    loadNetworksChanges(range),
    loadPhotoRows(range),
    loadPhotoTotals(range),
    loadSubmissionCounts(range),
    loadContributors(range),
  ]);

  const cellsByOperator = new Map<number, { total: number; added: number }>();
  for (const row of bandRows) {
    const current = cellsByOperator.get(row.operator.id) ?? { total: 0, added: 0 };
    cellsByOperator.set(row.operator.id, { total: current.total + row.cells, added: current.added + row.cells_added });
  }

  const stationsByOperator = indexByOperator(stationRows);
  const pciTotalsByOperator = indexByOperator(pciTotalRows);
  const pciAdditionsByOperator = indexByOperator(pciAdditionRows);
  const sectorTotalsByOperator = indexByOperator(sectorTotalRows);
  const sectorChangesByOperator = indexByOperator(sectorChangeRows);
  const networksTotalsByOperator = indexByOperator(networksTotalRows);
  const networksChangesByOperator = indexByOperator(networksChangeRows);
  const photosByOperator = indexByOperator(photoRows);

  const operatorStats = operatorRows.flatMap((operator) => {
    const stationCounts = stationsByOperator.get(operator.id);
    const cellCounts = cellsByOperator.get(operator.id);
    const photoCounts = photosByOperator.get(operator.id);
    const sectorChanges = sectorChangesByOperator.get(operator.id);
    const networksChanges = networksChangesByOperator.get(operator.id);
    const sectorTotal = sectorTotalsByOperator.get(operator.id)?.total ?? 0;
    const networksTotal = networksTotalsByOperator.get(operator.id)?.total ?? 0;
    const counts: OperatorCounts = {
      stations: stationCounts?.total ?? 0,
      stations_added: stationCounts?.added ?? 0,
      cells: cellCounts?.total ?? 0,
      cells_added: cellCounts?.added ?? 0,
      pcis: pciTotalsByOperator.get(operator.id)?.total ?? 0,
      pcis_added: pciAdditionsByOperator.get(operator.id)?.added ?? 0,
      azimuths: Math.max(0, sectorTotal - (sectorChanges?.added_later ?? 0) + (sectorChanges?.removed_later ?? 0)),
      azimuths_added: sectorChanges?.added ?? 0,
      networks_ids: Math.max(0, networksTotal - (networksChanges?.added_later ?? 0)),
      networks_ids_added: networksChanges?.added ?? 0,
      photos: photoCounts?.total ?? 0,
      photos_added: photoCounts?.added ?? 0,
    };
    return Object.values(counts).some((value) => value > 0) ? [{ operator, ...counts }] : [];
  });

  const until = end < now ? end : now;
  return {
    from: start.toISOString().slice(0, 10),
    to: new Date(Math.max(start.getTime(), until.getTime() - 1)).toISOString().slice(0, 10),
    contributors: contributorRows[0]?.contributors ?? 0,
    submissions: {
      submitted: submissionRows[0]?.submitted ?? 0,
      approved: submissionRows[0]?.approved ?? 0,
      rejected: submissionRows[0]?.rejected ?? 0,
    },
    photos: { total: photoTotalRows[0]?.total ?? 0, added: photoTotalRows[0]?.added ?? 0 },
    operators: operatorStats,
    bands: bandRows.filter((row) => row.cells > 0 || row.cells_added > 0),
    technologies: technologyRows.filter((row) => row.cells > 0 || row.cells_added > 0),
  };
}
