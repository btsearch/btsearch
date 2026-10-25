import {
  cellMatches,
  cellNetworks,
  cells,
  gsmCells,
  lteCells,
  nrCells,
  observationFlags,
  observedCellSummaries,
  observedCellValues,
  observedCells,
  umtsCells,
} from "@openbts/drizzle";
import { CELL_MATCH_LIMIT } from "@openbts/shared/contract";
import { and, asc, eq, exists, gt, gte, inArray, isNull, notInArray, or } from "drizzle-orm";

import db from "../../../../database/psql.js";
import { chunks, unique } from "../../../../lib/collections.js";
import type { DbTx } from "../../../../types/global.js";
import { logger } from "../../../../utils/logger.js";
import { cellNetworkCodes, loadOwnerCodes } from "../../../cells/networks.js";
import { loadExtraCodes, loadKnownPlmns } from "../../../cells/networkWrites.js";
import { stationCountries } from "../../../stations/country.js";
import { getStationCountryFeatures } from "../../../stations/countryFeatures.js";
import { MATCHED_FIELDS, isMatchedField } from "../../cells/identity.js";
import { withCodeVariants } from "../../networks.js";
import { daysAgo } from "../dates.js";
import { kindsRestingOn } from "../kinds.js";
import { cellNetworkSubject } from "../subjects.js";
import { type FlagSyncCounts, NOTHING_SYNCED, flagsIn, syncFlags } from "../sync.js";
import { syncMissingCells } from "./cellMissing.js";
import { type ListedNetworkRow, type MatchedObservedCell, type NetworkedCell, raiseNetworkFlags } from "./networks.js";
import { type ObservedValueRow, raiseValueFlags } from "./values.js";

const VALUES_SEEN_WITHIN_DAYS = 30;
const NETWORKS_SEEN_WITHIN_DAYS = 90;
const CELLS_SEEN_WITHIN_DAYS = 90;
const EDIT_MARGIN_MS = 60 * 1000;
const VALUE_AND_NETWORK_KINDS = ["valueDiffers", "valueMissing", "networkMissing", "networkNotSeen"] as const;

type CellPassSubjects = { cellIds: readonly number[]; observedSiteIds: readonly number[] };

let editedSince = new Date();

async function loadCells(tx: DbTx, cellIds: readonly number[]) {
  return tx
    .select({ cell: cells, gsm: gsmCells, umts: umtsCells, lte: lteCells, nr: nrCells, countryCode: stationCountries.countryCode })
    .from(cells)
    .innerJoin(stationCountries.table, eq(stationCountries.stationId, cells.station_id))
    .leftJoin(gsmCells, eq(gsmCells.cell_id, cells.id))
    .leftJoin(umtsCells, eq(umtsCells.cell_id, cells.id))
    .leftJoin(lteCells, eq(lteCells.cell_id, cells.id))
    .leftJoin(nrCells, eq(nrCells.cell_id, cells.id))
    .where(inArray(cells.id, [...cellIds]));
}

async function loadObservedValues(tx: DbTx, matched: readonly MatchedObservedCell[]): Promise<ObservedValueRow[]> {
  if (matched.length === 0) return [];

  const rows = await tx
    .select({
      observedCellId: observedCellValues.observedCellId,
      field: observedCellValues.field,
      value: observedCellValues.value,
      sampleCount: observedCellValues.sampleCount,
      contributorBits: observedCellValues.contributorBits,
      lastSeenOn: observedCellValues.lastSeenOn,
    })
    .from(observedCellValues)
    .where(
      and(
        inArray(
          observedCellValues.observedCellId,
          matched.map((cell) => cell.observedCellId),
        ),
        inArray(observedCellValues.field, [...MATCHED_FIELDS]),
      ),
    );
  const matchOf = new Map(matched.map((cell) => [cell.observedCellId, cell]));
  return rows.flatMap(({ field, ...row }) => {
    const match = matchOf.get(row.observedCellId);
    if (match === undefined || !isMatchedField(field)) return [];
    return [{ ...row, field, cellId: match.cellId, observedSiteId: match.observedSiteId, networkMatch: match.networkMatch }];
  });
}

async function loadMatchedObservedCells(tx: DbTx, cellIds: readonly number[]): Promise<MatchedObservedCell[]> {
  const rows = await tx
    .select({
      cellId: cellMatches.cellId,
      observedCellId: cellMatches.observedCellId,
      observedSiteId: observedCells.observedSiteId,
      plmn: observedCells.plmn,
      networkMatch: cellMatches.networkMatch,
      samples: observedCellSummaries.sampleCount,
      people: observedCellSummaries.personCount,
      lastSeenOn: observedCellSummaries.lastSeenOn,
    })
    .from(cellMatches)
    .innerJoin(observedCells, eq(observedCells.id, cellMatches.observedCellId))
    .leftJoin(observedCellSummaries, eq(observedCellSummaries.observedCellId, cellMatches.observedCellId))
    .where(inArray(cellMatches.cellId, [...cellIds]));
  return rows.flatMap(({ cellId, samples, people, ...row }) =>
    cellId === null ? [] : [{ ...row, cellId, samples: samples ?? 0, people: people ?? 0 }],
  );
}

async function loadListedNetworksByCellId(tx: DbTx, cellIds: readonly number[]): Promise<ListedNetworkRow[]> {
  const rows = await tx
    .select({
      cellId: cellMatches.cellId,
      observedCellId: cellMatches.observedCellId,
      observedSiteId: observedCells.observedSiteId,
      ownPlmn: observedCells.plmn,
      networkMatch: cellMatches.networkMatch,
      plmn: cellNetworks.plmn,
      sampleCount: cellNetworks.sampleCount,
      contributorBits: cellNetworks.contributorBits,
      lastSeenOn: cellNetworks.lastSeenOn,
    })
    .from(cellMatches)
    .innerJoin(observedCells, eq(observedCells.id, cellMatches.observedCellId))
    .innerJoin(cellNetworks, eq(cellNetworks.observedCellId, cellMatches.observedCellId))
    .where(inArray(cellMatches.cellId, [...cellIds]));
  return rows.flatMap(({ cellId, ...row }) => (cellId === null ? [] : [{ ...row, cellId }]));
}

function networkFlagsFixed(cells: readonly NetworkedCell[]) {
  const broadcast = cells.flatMap((cell) =>
    cellNetworkCodes(cell.ownerCode, cell.extraCodes).map((code) => ({
      kind: "networkMissing" as const,
      subjectKey: cellNetworkSubject(cell.id, code),
    })),
  );
  const listed = cells.flatMap((cell) => cell.extraCodes.map((code) => cellNetworkSubject(cell.id, code)));
  return or(flagsIn(broadcast), and(eq(observationFlags.kind, "networkNotSeen"), notInArray(observationFlags.subjectKey, listed)));
}

async function syncValueAndNetworkFlags(tx: DbTx, cellIds: readonly number[]): Promise<FlagSyncCounts> {
  if (cellIds.length === 0) return NOTHING_SYNCED;
  const [cellRows, observed, listedNetworks, extraCodes] = await Promise.all([
    loadCells(tx, cellIds),
    loadMatchedObservedCells(tx, cellIds),
    loadListedNetworksByCellId(tx, cellIds),
    loadExtraCodes(tx, cellIds),
  ]);
  if (cellRows.length === 0) return NOTHING_SYNCED;

  const stationIds = unique(cellRows.map((row) => row.cell.station_id));
  const [values, ownerCodes, featuresByStation, known] = await Promise.all([
    loadObservedValues(tx, observed),
    loadOwnerCodes(stationIds),
    getStationCountryFeatures(stationIds, tx),
    loadKnownPlmns(tx, withCodeVariants([...observed.map((row) => row.plmn), ...listedNetworks.map((row) => row.plmn)])),
  ]);
  const networkedCells = cellRows.map(({ cell, countryCode }) => ({
    id: cell.id,
    stationId: cell.station_id,
    rat: cell.rat,
    ownerCode: ownerCodes.get(cell.station_id),
    extraCodes: extraCodes.get(cell.id) ?? [],
    countryCode,
  }));

  const valueFindings = raiseValueFlags({ cells: cellRows, values, featuresByStation, seenSince: daysAgo(VALUES_SEEN_WITHIN_DAYS) });
  const raised = [
    ...valueFindings.raised,
    ...raiseNetworkFlags({ cells: networkedCells, observedCells: observed, listedNetworks, known, seenSince: daysAgo(NETWORKS_SEEN_WITHIN_DAYS) }),
  ];
  return syncFlags(tx, {
    kinds: VALUE_AND_NETWORK_KINDS,
    lookedAt: inArray(observationFlags.cellId, [...cellIds]),
    raised,
    fixed: or(flagsIn(valueFindings.fixed), networkFlagsFixed(networkedCells)),
  });
}

export async function runCellPass({ cellIds, observedSiteIds }: CellPassSubjects): Promise<void> {
  if (cellIds.length === 0 && observedSiteIds.length === 0) return;

  const startedAt = Date.now();
  const counts = await db.transaction(async (tx) => ({
    valueAndNetworkFlags: await syncValueAndNetworkFlags(tx, cellIds),
    cellMissing: await syncMissingCells(tx, observedSiteIds, daysAgo(CELLS_SEEN_WITHIN_DAYS)),
  }));
  logger.info("observations.flags.cell_pass_finished", {
    cells: cellIds.length,
    sites: observedSiteIds.length,
    ms: Date.now() - startedAt,
    ...counts,
  });
}

export async function passEditedCells(): Promise<void> {
  const startedAt = Date.now();
  const hasMatch = db.select({ id: cellMatches.observedCellId }).from(cellMatches).where(eq(cellMatches.cellId, cells.id));
  let afterId = 0;
  let edited: number[];
  do {
    // oxlint-disable-next-line no-await-in-loop
    const rows = await db
      .select({ id: cells.id })
      .from(cells)
      .where(and(gte(cells.updatedAt, editedSince), gt(cells.id, afterId), exists(hasMatch)))
      .orderBy(asc(cells.id))
      .limit(CELL_MATCH_LIMIT);
    edited = rows.map((row) => row.id);
    // oxlint-disable-next-line no-await-in-loop
    await runCellPass({ cellIds: edited, observedSiteIds: [] });
    afterId = edited.at(-1) ?? afterId;
  } while (edited.length === CELL_MATCH_LIMIT);
  editedSince = new Date(startedAt - EDIT_MARGIN_MS);
}

export async function passFlagsOfGoneObservations(): Promise<void> {
  const orphaned = await db
    .selectDistinct({ cellId: observationFlags.cellId })
    .from(observationFlags)
    .where(
      and(
        isNull(observationFlags.closedReason),
        inArray(observationFlags.kind, [...VALUE_AND_NETWORK_KINDS]),
        isNull(observationFlags.observedCellId),
      ),
    );
  const cellIds = unique(orphaned.map((flag) => flag.cellId));
  // oxlint-disable-next-line no-await-in-loop
  for (const part of chunks(cellIds, CELL_MATCH_LIMIT)) await runCellPass({ cellIds: part, observedSiteIds: [] });

  const goneWith = (reference: "observedCellId" | "observedSiteId") =>
    and(inArray(observationFlags.kind, kindsRestingOn(reference)), isNull(observationFlags[reference]));
  const counts = await db.transaction((tx) =>
    syncFlags(tx, {
      kinds: [...kindsRestingOn("observedCellId"), ...kindsRestingOn("observedSiteId")],
      lookedAt: or(goneWith("observedCellId"), goneWith("observedSiteId")),
      raised: [],
    }),
  );
  if (cellIds.length > 0 || counts.resolved > 0) logger.info("observations.flags.gone_observations_passed", { cells: cellIds.length, ...counts });
}
