import { bands, cells, gsmCells, lteCells, nrCells, operatorLinks, operators, plmns, stations, umtsCells } from "@openbts/drizzle";
import type {
  Cell,
  CellDifference,
  CellDifferenceField,
  CellMatch,
  CellMatchAnswer,
  CellMatchInclude,
  CellMatchReason,
  CellMatchResult,
  CountryFeatures,
  NrIdentity,
  ObservedCell,
  Station,
} from "@openbts/shared/contract";
import { type AnyColumn, type SQL, and, asc, eq, inArray, or } from "drizzle-orm";
import type { FastifyRequest } from "fastify";

import db from "../../database/psql.js";
import { type LimitedTask, runLimited } from "../../lib/async/runLimited.js";
import { chunks, unique } from "../../lib/collections.js";
import { logger } from "../../utils/logger.js";
import { loadHiddenCountryCodes } from "../countries/visibility.js";
import { disabledCountryFeatures, getStationCountryFeatures } from "../stations/countryFeatures.js";
import { serializeStations, stationAreaConditions } from "../stations/read.js";
import { type CellRows, toCell } from "../stations/serialize.js";
import { UKE_MATCH_MNCS, candidateLTEEnbids, lteEnbidKey, ukeFragmentCandidates } from "./logic.js";
import { type OfficialSiteMatches, type OfficialSiteSearch, findOfficialSites } from "./officialSites.js";

type Network = { operatorId: number; legacyMnc: number; partnerIds: number[] };
type StoredCell = CellRows & { operatorId: number | null };
type IdentifierPair = [number, number];
type IdentifiersByOperator<T> = Map<number, Map<string, T>>;
type ObservedCellMatch = { result: CellMatchResult; storedCell: StoredCell | null };
type ComparedField = [field: CellDifferenceField, observed: number | null | undefined, stored: number | null];
type StoredCellIndex = {
  gsm: Map<string, StoredCell>;
  umtsByRnc: Map<string, StoredCell>;
  umtsByLac: Map<string, StoredCell>;
  lte: Map<string, StoredCell>;
  lteStations: Map<string, StoredCell>;
  nr: Map<string, StoredCell>;
  nrByNci: Map<string, StoredCell>;
  nrStations: Map<string, StoredCell>;
};

const PAIRS_PER_QUERY = 200;
const VALUES_PER_QUERY = 1000;
const NCI_BITS = 36;
const DEFAULT_GNBID_LENGTH = 24;
const CELLS_PER_GNB = 2 ** (NCI_BITS - DEFAULT_GNBID_LENGTH);

function plmnCandidates(plmn: string): string[] {
  const mcc = plmn.slice(0, 3);
  const mnc = plmn.slice(3);
  if (mnc.length === 2) return [plmn, `${mcc}0${mnc}`];
  return mnc.startsWith("0") ? [plmn, `${mcc}${mnc.slice(1)}`] : [plmn];
}

function identityKey(operatorId: number, ...values: (number | string)[]): string {
  return `${operatorId}:${values.join(":")}`;
}

function knownRnc(rnc: number | null | undefined): number | null {
  return rnc === undefined || rnc === null || rnc === 0 ? null : rnc;
}

function nrCellIdentity(cell: Extract<ObservedCell, { rat: "nr" }>): NrIdentity | null {
  if (typeof cell.gnbid === "number" && typeof cell.clid === "number") return cell.gnbid === 0 ? null : { gnbid: cell.gnbid, clid: cell.clid };
  if (typeof cell.nci !== "number") return null;

  const gnbid = Math.floor(cell.nci / CELLS_PER_GNB);
  return gnbid === 0 ? null : { gnbid, clid: cell.nci % CELLS_PER_GNB };
}

function unsplitNci(cell: Extract<ObservedCell, { rat: "nr" }>): number | null {
  const isSplit = typeof cell.gnbid === "number" && typeof cell.clid === "number";
  return isSplit || typeof cell.nci !== "number" ? null : cell.nci;
}

function storedNrIdentity({ nr }: StoredCell): NrIdentity | null {
  if (!nr || nr.gnbid === null || nr.gnbid === 0 || nr.clid === null) return null;
  return { gnbid: nr.gnbid, clid: nr.clid };
}

function addIdentifier<T extends number | IdentifierPair>(identifiers: IdentifiersByOperator<T>, operatorId: number, identifier: T): void {
  const byKey = identifiers.get(operatorId) ?? new Map<string, T>();
  byKey.set(String(identifier), identifier);
  identifiers.set(operatorId, byKey);
}

function lookupTasks<T>(identifiers: IdentifiersByOperator<T>, size: number, run: (operatorId: number, chunk: T[]) => Promise<void>): LimitedTask[] {
  const tasks: LimitedTask[] = [];
  for (const [operatorId, byKey] of identifiers) {
    for (const chunk of chunks([...byKey.values()], size)) tasks.push(() => run(operatorId, chunk));
  }
  return tasks;
}

function isBetter(row: StoredCell, kept: StoredCell, operatorId: number): boolean {
  const isOwn = row.operatorId === operatorId;
  const isKeptOwn = kept.operatorId === operatorId;
  return isOwn === isKeptOwn ? row.cell.id < kept.cell.id : isOwn;
}

function keep(found: Map<string, StoredCell>, key: string, row: StoredCell, operatorId: number): void {
  const kept = found.get(key);
  if (!kept || isBetter(row, kept, operatorId)) found.set(key, row);
}

function inPairs(first: AnyColumn, second: AnyColumn, pairs: readonly IdentifierPair[]): SQL | undefined {
  return or(...pairs.map(([a, b]) => and(eq(first, a), eq(second, b))));
}

async function loadPublishedCells(identifiers: SQL | undefined, operatorIds: readonly number[], hidden: readonly string[]): Promise<StoredCell[]> {
  return db
    .select({ cell: cells, gsm: gsmCells, umts: umtsCells, lte: lteCells, nr: nrCells, operatorId: stations.operator_id })
    .from(cells)
    .innerJoin(stations, eq(stations.id, cells.station_id))
    .leftJoin(gsmCells, eq(gsmCells.cell_id, cells.id))
    .leftJoin(umtsCells, eq(umtsCells.cell_id, cells.id))
    .leftJoin(lteCells, eq(lteCells.cell_id, cells.id))
    .leftJoin(nrCells, eq(nrCells.cell_id, cells.id))
    .where(and(identifiers, inArray(stations.operator_id, [...operatorIds]), eq(stations.status, "published"), ...stationAreaConditions({}, hidden)));
}

async function loadPartners(operatorIds: readonly number[]): Promise<Map<number, number[]>> {
  if (operatorIds.length === 0) return new Map();

  const ventures = db
    .select({ id: operatorLinks.relatedOperatorId })
    .from(operatorLinks)
    .where(and(inArray(operatorLinks.operatorId, [...operatorIds]), eq(operatorLinks.kind, "jv_member")));
  const members = await db
    .select({ operatorId: operatorLinks.operatorId, ventureId: operatorLinks.relatedOperatorId })
    .from(operatorLinks)
    .where(and(inArray(operatorLinks.relatedOperatorId, ventures), eq(operatorLinks.kind, "jv_member")));

  const partners = new Map<number, number[]>();
  for (const operatorId of operatorIds) {
    const ventureIds = new Set(members.filter((member) => member.operatorId === operatorId).map((member) => member.ventureId));
    const others = members.filter((member) => member.operatorId !== operatorId && ventureIds.has(member.ventureId));
    partners.set(operatorId, unique(others.map((member) => member.operatorId)));
  }
  return partners;
}

async function resolveNetworks(plmnCodes: readonly string[], hidden: readonly string[]): Promise<Map<string, Network>> {
  const rows = await db
    .select({ code: plmns.code, operatorId: plmns.operatorId, legacyMnc: operators.mnc, countryCode: operators.countryCode })
    .from(plmns)
    .innerJoin(operators, eq(operators.id, plmns.operatorId))
    .where(inArray(plmns.code, unique(plmnCodes.flatMap(plmnCandidates))));
  const visible = new Map(rows.filter((row) => !hidden.includes(row.countryCode)).map((row) => [row.code, row]));
  const partners = await loadPartners(unique([...visible.values()].map((row) => row.operatorId)));

  const networks = new Map<string, Network>();
  for (const plmn of plmnCodes) {
    const row = plmnCandidates(plmn).flatMap((code) => visible.get(code) ?? [])[0];
    if (row) networks.set(plmn, { operatorId: row.operatorId, legacyMnc: row.legacyMnc ?? 0, partnerIds: partners.get(row.operatorId) ?? [] });
  }
  return networks;
}

async function findStoredCells(
  observed: readonly ObservedCell[],
  networks: ReadonlyMap<string, Network>,
  hidden: readonly string[],
): Promise<StoredCellIndex> {
  const found: StoredCellIndex = {
    gsm: new Map(),
    umtsByRnc: new Map(),
    umtsByLac: new Map(),
    lte: new Map(),
    lteStations: new Map(),
    nr: new Map(),
    nrByNci: new Map(),
    nrStations: new Map(),
  };
  const networksById = new Map([...networks.values()].map((network) => [network.operatorId, network]));
  const sharedBy = (operatorId: number) => [operatorId, ...(networksById.get(operatorId)?.partnerIds ?? [])];

  const gsmPairs: IdentifiersByOperator<IdentifierPair> = new Map();
  const umtsRncPairs: IdentifiersByOperator<IdentifierPair> = new Map();
  const ltePairs: IdentifiersByOperator<IdentifierPair> = new Map();
  const gnbids: IdentifiersByOperator<number> = new Map();
  const ncis: IdentifiersByOperator<number> = new Map();
  for (const cell of observed) {
    const own = networks.get(cell.plmn)?.operatorId;
    if (own === undefined) continue;

    switch (cell.rat) {
      case "gsm":
        addIdentifier(gsmPairs, own, [cell.lac, cell.cid]);
        break;
      case "umts": {
        const rnc = knownRnc(cell.rnc);
        if (rnc !== null) addIdentifier(umtsRncPairs, own, [rnc, cell.cid]);
        break;
      }
      case "lte":
        if (cell.enbid > 0) addIdentifier(ltePairs, own, [cell.enbid, cell.clid]);
        break;
      case "nr": {
        const identity = nrCellIdentity(cell);
        if (identity) addIdentifier(gnbids, own, identity.gnbid);
        const nci = unsplitNci(cell);
        if (nci !== null) addIdentifier(ncis, own, nci);
        break;
      }
    }
  }

  await runLimited([
    ...lookupTasks(gsmPairs, PAIRS_PER_QUERY, async (own, chunk) => {
      for (const row of await loadPublishedCells(inPairs(gsmCells.lac, gsmCells.cid, chunk), [own], hidden)) {
        if (row.gsm) keep(found.gsm, identityKey(own, row.gsm.lac, row.gsm.cid), row, own);
      }
    }),
    ...lookupTasks(umtsRncPairs, PAIRS_PER_QUERY, async (own, chunk) => {
      for (const row of await loadPublishedCells(inPairs(umtsCells.rnc, umtsCells.cid, chunk), [own], hidden)) {
        if (row.umts) keep(found.umtsByRnc, identityKey(own, row.umts.rnc, row.umts.cid), row, own);
      }
    }),
    ...lookupTasks(ltePairs, PAIRS_PER_QUERY, async (own, chunk) => {
      for (const row of await loadPublishedCells(inPairs(lteCells.enbid, lteCells.clid, chunk), sharedBy(own), hidden)) {
        if (row.lte) keep(found.lte, identityKey(own, row.lte.enbid, row.lte.clid), row, own);
      }
    }),
    ...lookupTasks(gnbids, VALUES_PER_QUERY, async (own, chunk) => {
      for (const row of await loadPublishedCells(inArray(nrCells.gnbid, chunk), sharedBy(own), hidden)) {
        if (!row.nr || row.nr.gnbid === null) continue;
        keep(found.nrStations, identityKey(own, row.nr.gnbid), row, own);
        if (row.nr.clid !== null) keep(found.nr, identityKey(own, row.nr.gnbid, row.nr.clid), row, own);
      }
    }),
    ...lookupTasks(ncis, VALUES_PER_QUERY, async (own, chunk) => {
      for (const row of await loadPublishedCells(inArray(nrCells.nci, chunk.map(BigInt)), sharedBy(own), hidden)) {
        if (!row.nr || row.nr.nci === null || storedNrIdentity(row) === null) continue;
        keep(found.nrByNci, identityKey(own, Number(row.nr.nci)), row, own);
      }
    }),
  ]);

  const umtsLacPairs: IdentifiersByOperator<IdentifierPair> = new Map();
  const enbids: IdentifiersByOperator<number> = new Map();
  for (const cell of observed) {
    const network = networks.get(cell.plmn);
    if (!network) continue;
    const own = network.operatorId;

    if (cell.rat === "umts") {
      const rnc = knownRnc(cell.rnc);
      const isFound = rnc !== null && found.umtsByRnc.has(identityKey(own, rnc, cell.cid));
      if (!isFound) addIdentifier(umtsLacPairs, own, [cell.lac, cell.cid]);
    } else if (cell.rat === "lte" && cell.enbid > 0 && !found.lte.has(identityKey(own, cell.enbid, cell.clid))) {
      for (const enbid of candidateLTEEnbids(network.legacyMnc, cell.enbid)) addIdentifier(enbids, own, enbid);
    }
  }

  await runLimited([
    ...lookupTasks(umtsLacPairs, PAIRS_PER_QUERY, async (own, chunk) => {
      for (const row of await loadPublishedCells(inPairs(umtsCells.lac, umtsCells.cid, chunk), [own], hidden)) {
        if (row.umts && row.umts.lac !== null) keep(found.umtsByLac, identityKey(own, row.umts.lac, row.umts.cid), row, own);
      }
    }),
    ...lookupTasks(enbids, VALUES_PER_QUERY, async (own, chunk) => {
      const legacyMnc = networksById.get(own)?.legacyMnc ?? 0;
      for (const row of await loadPublishedCells(inArray(lteCells.enbid, chunk), sharedBy(own), hidden)) {
        if (row.lte) keep(found.lteStations, identityKey(own, lteEnbidKey(legacyMnc, row.lte.enbid)), row, own);
      }
    }),
  ]);

  return found;
}

function unmatched(operatorId: number | null, reason: CellMatchReason, nrIdentity: NrIdentity | null = null): ObservedCellMatch {
  return {
    result: { operatorId, match: "none", reason, stationId: null, cellId: null, isShared: false, differences: [], nrIdentity },
    storedCell: null,
  };
}

function matched(
  match: Exclude<CellMatch, "none">,
  network: Network,
  storedCell: StoredCell,
  differences: CellDifference[] = [],
  nrIdentity: NrIdentity | null = null,
): ObservedCellMatch {
  return {
    result: {
      operatorId: network.operatorId,
      match,
      reason: null,
      stationId: storedCell.cell.station_id,
      cellId: match === "station" ? null : storedCell.cell.id,
      isShared: storedCell.operatorId !== network.operatorId,
      differences,
      nrIdentity,
    },
    storedCell,
  };
}

function findDifferences(comparisons: readonly ComparedField[], features: Readonly<CountryFeatures>): CellDifference[] {
  return comparisons.flatMap(([field, observed, stored]) => {
    if (observed === null || observed === undefined || observed === stored) return [];
    if ((field === "psc" && !features.psc) || (field === "bsic" && !features.bsic)) return [];
    return [{ field, observed, stored }];
  });
}

function resolveCell(
  cell: ObservedCell,
  network: Network | undefined,
  found: StoredCellIndex,
  featuresByStation: ReadonlyMap<number, CountryFeatures>,
): ObservedCellMatch {
  if (!network) return unmatched(null, "operatorUnknown");
  const own = network.operatorId;
  const compare = (stored: StoredCell, comparisons: readonly ComparedField[]) =>
    findDifferences(comparisons, featuresByStation.get(stored.cell.station_id) ?? disabledCountryFeatures);

  switch (cell.rat) {
    case "gsm": {
      const exact = found.gsm.get(identityKey(own, cell.lac, cell.cid));
      if (!exact?.gsm) return unmatched(own, "cellUnknown");
      return matched("cell", network, exact, compare(exact, [["bsic", cell.bsic, exact.gsm.bsic]]));
    }

    case "umts": {
      const rnc = knownRnc(cell.rnc);
      const exact = rnc === null ? undefined : found.umtsByRnc.get(identityKey(own, rnc, cell.cid));
      if (exact?.umts) {
        const differences = compare(exact, [
          ["lac", cell.lac, exact.umts.lac],
          ["psc", cell.psc, exact.umts.psc],
          ["uarfcn", cell.uarfcn, exact.umts.arfcn],
        ]);
        return matched("cell", network, exact, differences);
      }

      const byLac = found.umtsByLac.get(identityKey(own, cell.lac, cell.cid));
      if (!byLac?.umts) return unmatched(own, "cellUnknown");
      const differences = compare(byLac, [
        ["rnc", rnc, knownRnc(byLac.umts.rnc)],
        ["psc", cell.psc, byLac.umts.psc],
        ["uarfcn", cell.uarfcn, byLac.umts.arfcn],
      ]);
      return matched("cellByLac", network, byLac, differences);
    }

    case "lte": {
      if (cell.enbid === 0) return unmatched(own, "noIdentifiers");

      const exact = found.lte.get(identityKey(own, cell.enbid, cell.clid));
      if (exact?.lte) {
        const differences = compare(exact, [
          ["tac", cell.tac, exact.lte.tac],
          ["pci", cell.pci, exact.lte.pci],
          ["earfcn", cell.earfcn, exact.lte.earfcn],
        ]);
        return matched("cell", network, exact, differences);
      }

      const station = found.lteStations.get(identityKey(own, lteEnbidKey(network.legacyMnc, cell.enbid)));
      return station ? matched("station", network, station) : unmatched(own, "cellUnknown");
    }

    case "nr": {
      const split = nrCellIdentity(cell);
      const nci = unsplitNci(cell);
      const byNci = nci === null ? undefined : found.nrByNci.get(identityKey(own, nci));
      const bySplit = byNci !== undefined || split === null ? undefined : found.nr.get(identityKey(own, split.gnbid, split.clid));
      const identity = byNci ? storedNrIdentity(byNci) : split;
      if (identity === null) return unmatched(own, "noIdentifiers");

      const exact = byNci ?? bySplit;
      if (exact?.nr) {
        const differences = compare(exact, [
          ["tac", cell.tac, exact.nr.nrtac],
          ["pci", cell.pci, exact.nr.pci],
          ["arfcn", cell.arfcn, exact.nr.arfcn],
        ]);
        return matched("cell", network, exact, differences, identity);
      }

      const station = found.nrStations.get(identityKey(own, identity.gnbid));
      return station ? matched("station", network, station, [], identity) : unmatched(own, "cellUnknown", identity);
    }
  }
}

async function loadStations(stationIds: readonly number[]): Promise<Station[]> {
  if (stationIds.length === 0) return [];

  const rows = await db
    .select()
    .from(stations)
    .where(inArray(stations.id, [...stationIds]))
    .orderBy(asc(stations.id));
  return serializeStations(rows, ["location"]);
}

async function serializeMatchedCells(storedCells: readonly StoredCell[], featuresByStation: ReadonlyMap<number, CountryFeatures>): Promise<Cell[]> {
  const rows = [...new Map(storedCells.map((row) => [row.cell.id, row])).values()].sort((a, b) => a.cell.id - b.cell.id);
  if (rows.length === 0) return [];

  const bandsById = new Map((await db.select().from(bands)).map((band) => [band.id, band]));
  return rows.flatMap(
    (row) => toCell(row, bandsById.get(row.cell.band_id), false, featuresByStation.get(row.cell.station_id) ?? disabledCountryFeatures) ?? [],
  );
}

async function findOfficialSitesForUnknownCells(
  observed: readonly ObservedCell[],
  results: readonly CellMatchResult[],
  networks: ReadonlyMap<string, Network>,
): Promise<OfficialSiteMatches> {
  const searches = observed.map((cell, index): OfficialSiteSearch => {
    const network = networks.get(cell.plmn);
    if (!network || cell.rat !== "lte" || results[index]?.reason !== "cellUnknown" || !UKE_MATCH_MNCS.has(network.legacyMnc)) {
      return { operatorIds: [], fragments: [] };
    }
    return { operatorIds: [network.operatorId, ...network.partnerIds], fragments: ukeFragmentCandidates(network.legacyMnc, cell.enbid) };
  });

  return findOfficialSites(searches).catch((error: unknown) => {
    logger.error("analyzer.officialSites", { error });
    return { siteIds: [], sites: [] };
  });
}

export async function matchCells(
  req: FastifyRequest,
  observed: readonly ObservedCell[],
  include: readonly CellMatchInclude[],
): Promise<CellMatchAnswer> {
  const hidden = await loadHiddenCountryCodes(req);
  const networks = await resolveNetworks(unique(observed.map((cell) => cell.plmn)), hidden);
  const found = await findStoredCells(observed, networks, hidden);
  const storedStationIds = unique(Object.values(found).flatMap((index) => [...index.values()].map((row) => row.cell.station_id)));
  const featuresByStation = await getStationCountryFeatures(storedStationIds);

  const matches = observed.map((cell) => resolveCell(cell, networks.get(cell.plmn), found, featuresByStation));
  const results = matches.map(({ result }) => result);
  const stationIds = unique(results.flatMap((result) => result.stationId ?? []));
  const matchedCells = matches.flatMap(({ result, storedCell }) => (storedCell && result.cellId !== null ? [storedCell] : []));

  const [stationList, cellList, officialSites] = await Promise.all([
    include.includes("stations") ? loadStations(stationIds) : undefined,
    include.includes("cells") ? serializeMatchedCells(matchedCells, featuresByStation) : undefined,
    include.includes("officialSites") ? findOfficialSitesForUnknownCells(observed, results, networks) : undefined,
  ]);

  const answer: CellMatchAnswer = { results };
  if (stationList) answer.stations = stationList;
  if (cellList) answer.cells = cellList;
  if (officialSites) {
    answer.results = results.map((result, index) => ({ ...result, officialSiteIds: officialSites.siteIds[index] ?? [] }));
    answer.officialSites = officialSites.sites;
  }
  return answer;
}
