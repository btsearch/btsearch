import { cellPlmns, cells, gsmCells, lteCells, nrCells, plmns, stations, umtsCells } from "@openbts/drizzle";
import { type SQL, and, eq, inArray, isNull, ne, not, notInArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import db from "../../database/psql.js";
import { ErrorResponse } from "../../errors.js";
import type { DbClient, DbTx } from "../../types/global.js";
import type { StoredCellScope } from "./arfcnValidation.js";
import {
  type CellIdentityDuplicateDetails,
  getCellIdentityDuplicateKey,
  getCellIdentityDuplicateSpec,
  isUnknownCellIdentity,
  toIdentityDetails,
} from "./identityDuplicateSpecs.js";
import { type NetworkOwner, loadNetworkOwner } from "./networkWrites.js";
import { type PciDuplicateDetails, type PciDuplicateSpec, getPciDuplicateKey, getPciDuplicateSpec } from "./pciDuplicateSpecs.js";

type CellIdentityDuplicateEntry = {
  values: Record<string, number>;
  excludeCellId?: number;
  networks: SQL;
};

export type CellIdentityDuplicateSource = {
  rat?: string | null;
  details?: CellIdentityDuplicateDetails | null;
  excludeCellId?: number;
  extraCodes?: readonly string[];
};

type CellIdentityDuplicateCheck = {
  rat: string;
  checkEntries: (client: DbClient, entries: CellIdentityDuplicateEntry[], siblingExcludeIds: number[]) => Promise<void>;
};

type PciDuplicateEntry = {
  bandId: number;
  enbid?: number;
  pci: number;
  channel?: number | null;
  excludeCellId?: number;
};

export interface PciDuplicateSource {
  rat?: string | null;
  bandId?: number | null;
  details?: PciDuplicateDetails | null;
  excludeCellId?: number;
}

type PciDuplicateCheckSpec = PciDuplicateSpec & {
  table: typeof lteCells | typeof nrCells;
  cellIdColumn: typeof lteCells.cell_id | typeof nrCells.cell_id;
  pciColumn: typeof lteCells.pci | typeof nrCells.pci;
  enbidColumn?: typeof lteCells.enbid;
  channelColumn: typeof lteCells.earfcn | typeof nrCells.arfcn;
  label: string;
};

function withPciDuplicateCheck(rat: string, config: Omit<PciDuplicateCheckSpec, keyof PciDuplicateSpec>): PciDuplicateCheckSpec {
  const spec = getPciDuplicateSpec(rat);
  if (!spec) throw new Error(`Missing PCI duplicate spec for ${rat}`);
  return { ...spec, ...config };
}

const PCI_DUPLICATE_CHECKS: PciDuplicateCheckSpec[] = [
  withPciDuplicateCheck("LTE", {
    table: lteCells,
    cellIdColumn: lteCells.cell_id,
    pciColumn: lteCells.pci,
    enbidColumn: lteCells.enbid,
    channelColumn: lteCells.earfcn,
    label: "LTE",
  }),
  withPciDuplicateCheck("NR", {
    table: nrCells,
    cellIdColumn: nrCells.cell_id,
    pciColumn: nrCells.pci,
    channelColumn: nrCells.arfcn,
    label: "NR",
  }),
];

const CELL_IDENTITY_DUPLICATE_CHECKS: CellIdentityDuplicateCheck[] = [
  {
    rat: "GSM",
    checkEntries: async (client, entries, siblingExcludeIds) => {
      if (entries.length === 0) return;

      const conditions = entries.flatMap((entry) => {
        const lac = entry.values.lac;
        const cid = entry.values.cid;
        if (lac === undefined || cid === undefined) return [];
        return [
          and(
            eq(gsmCells.lac, lac),
            eq(gsmCells.cid, cid),
            entry.excludeCellId !== undefined ? ne(gsmCells.cell_id, entry.excludeCellId) : undefined,
            entry.networks,
          ),
        ];
      });
      if (conditions.length === 0) return;

      const existing = await client
        .select({ lac: gsmCells.lac, cid: gsmCells.cid })
        .from(gsmCells)
        .innerJoin(cells, eq(cells.id, gsmCells.cell_id))
        .innerJoin(stations, eq(stations.id, cells.station_id))
        .where(
          and(
            eq(stations.status, "published"),
            siblingExcludeIds.length > 0 ? notInArray(gsmCells.cell_id, siblingExcludeIds) : undefined,
            or(...conditions),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        const duplicate = existing[0]!;
        throw new ErrorResponse("DUPLICATE_ENTRY", {
          message: `A GSM cell with LAC ${duplicate.lac} and CID ${duplicate.cid} already exists on one of the cell's networks`,
        });
      }
    },
  },
  {
    rat: "UMTS",
    checkEntries: async (client, entries, siblingExcludeIds) => {
      if (entries.length === 0) return;

      const conditions = entries.flatMap((entry) => {
        const rnc = entry.values.rnc;
        const cid = entry.values.cid;
        if (rnc === undefined || cid === undefined) return [];
        return [
          and(
            eq(umtsCells.rnc, rnc),
            eq(umtsCells.cid, cid),
            entry.excludeCellId !== undefined ? ne(umtsCells.cell_id, entry.excludeCellId) : undefined,
            entry.networks,
          ),
        ];
      });
      if (conditions.length === 0) return;

      const existing = await client
        .select({ rnc: umtsCells.rnc, cid: umtsCells.cid })
        .from(umtsCells)
        .innerJoin(cells, eq(cells.id, umtsCells.cell_id))
        .innerJoin(stations, eq(stations.id, cells.station_id))
        .where(
          and(
            eq(stations.status, "published"),
            siblingExcludeIds.length > 0 ? notInArray(umtsCells.cell_id, siblingExcludeIds) : undefined,
            or(...conditions),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        const duplicate = existing[0]!;
        throw new ErrorResponse("DUPLICATE_ENTRY", {
          message: `A UMTS cell with RNC ${duplicate.rnc} and CID ${duplicate.cid} already exists on one of the cell's networks`,
        });
      }
    },
  },
  {
    rat: "LTE",
    checkEntries: async (client, entries, siblingExcludeIds) => {
      if (entries.length === 0) return;

      const conditions = entries.flatMap((entry) => {
        const enbid = entry.values.enbid;
        const clid = entry.values.clid;
        if (enbid === undefined || clid === undefined) return [];
        return [
          and(
            eq(lteCells.enbid, enbid),
            eq(lteCells.clid, clid),
            entry.excludeCellId !== undefined ? ne(lteCells.cell_id, entry.excludeCellId) : undefined,
            entry.networks,
          ),
        ];
      });
      if (conditions.length === 0) return;

      const existing = await client
        .select({ enbid: lteCells.enbid, clid: lteCells.clid })
        .from(lteCells)
        .innerJoin(cells, eq(cells.id, lteCells.cell_id))
        .innerJoin(stations, eq(stations.id, cells.station_id))
        .where(
          and(
            eq(stations.status, "published"),
            siblingExcludeIds.length > 0 ? notInArray(lteCells.cell_id, siblingExcludeIds) : undefined,
            or(...conditions),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        const duplicate = existing[0]!;
        throw new ErrorResponse("DUPLICATE_ENTRY", {
          message: `An LTE cell with eNBID ${duplicate.enbid} and CLID ${duplicate.clid} already exists on one of the cell's networks`,
        });
      }
    },
  },
  {
    rat: "NR",
    checkEntries: async (client, entries, siblingExcludeIds) => {
      if (entries.length === 0) return;

      const conditions = entries.flatMap((entry) => {
        const nci = entry.values.nci;
        if (nci === undefined) return [];
        return [
          and(eq(nrCells.nci, BigInt(nci)), entry.excludeCellId !== undefined ? ne(nrCells.cell_id, entry.excludeCellId) : undefined, entry.networks),
        ];
      });
      if (conditions.length === 0) return;

      const existing = await client
        .select({ nci: nrCells.nci })
        .from(nrCells)
        .innerJoin(cells, eq(cells.id, nrCells.cell_id))
        .innerJoin(stations, eq(stations.id, cells.station_id))
        .where(
          and(
            eq(stations.status, "published"),
            siblingExcludeIds.length > 0 ? notInArray(nrCells.cell_id, siblingExcludeIds) : undefined,
            or(...conditions),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        const duplicate = existing[0]!;
        throw new ErrorResponse("DUPLICATE_ENTRY", {
          message: `An NR cell with NCI ${duplicate.nci} already exists on one of the cell's networks`,
        });
      }
    },
  },
];

const CELL_IDENTITY_LOCK_SPACE = 1;
const COLLISIONS_NAMED = 5;

const otherCells = alias(cells, "other_cells");
const otherStations = alias(stations, "other_stations");
const otherGsmCells = alias(gsmCells, "other_gsm_cells");
const otherUmtsCells = alias(umtsCells, "other_umts_cells");
const otherLteCells = alias(lteCells, "other_lte_cells");
const otherNrCells = alias(nrCells, "other_nr_cells");

const IDENTITY_COLLISION_JOINS = [
  {
    table: gsmCells,
    cellId: gsmCells.cell_id,
    other: otherGsmCells,
    otherCellId: otherGsmCells.cell_id,
    matches: and(eq(otherGsmCells.lac, gsmCells.lac), eq(otherGsmCells.cid, gsmCells.cid)),
    identity: sql<string>`concat('GSM LAC ', ${gsmCells.lac}, ' CID ', ${gsmCells.cid})`,
  },
  {
    table: umtsCells,
    cellId: umtsCells.cell_id,
    other: otherUmtsCells,
    otherCellId: otherUmtsCells.cell_id,
    matches: and(eq(otherUmtsCells.rnc, umtsCells.rnc), eq(otherUmtsCells.cid, umtsCells.cid), not(and(eq(umtsCells.rnc, 0), eq(umtsCells.cid, 0))!)),
    identity: sql<string>`concat('UMTS RNC ', ${umtsCells.rnc}, ' CID ', ${umtsCells.cid})`,
  },
  {
    table: lteCells,
    cellId: lteCells.cell_id,
    other: otherLteCells,
    otherCellId: otherLteCells.cell_id,
    matches: and(
      eq(otherLteCells.enbid, lteCells.enbid),
      eq(otherLteCells.clid, lteCells.clid),
      not(and(eq(lteCells.enbid, 0), eq(lteCells.clid, 0))!),
    ),
    identity: sql<string>`concat('LTE eNBID ', ${lteCells.enbid}, ' CLID ', ${lteCells.clid})`,
  },
  {
    table: nrCells,
    cellId: nrCells.cell_id,
    other: otherNrCells,
    otherCellId: otherNrCells.cell_id,
    matches: and(eq(otherNrCells.nci, nrCells.nci), ne(nrCells.gnbid, 0)),
    identity: sql<string>`concat('NR NCI ', ${nrCells.nci})`,
  },
];

function sharesNetwork(owner: NetworkOwner, extraCodes: readonly string[]): SQL {
  const codes = [...new Set([...(owner.mainCode === null ? [] : [owner.mainCode]), ...extraCodes])];
  const ownedWithoutCode = owner.mainCode === null && owner.operatorId !== null ? eq(stations.operator_id, owner.operatorId) : undefined;
  if (codes.length === 0) return ownedWithoutCode ?? sql`false`;

  const ownedByCode = inArray(
    stations.operator_id,
    db
      .select({ id: plmns.operatorId })
      .from(plmns)
      .where(and(eq(plmns.role, "primary"), inArray(plmns.code, codes))),
  );
  const broadcastByCode = inArray(
    cells.id,
    db.select({ id: cellPlmns.cellId }).from(cellPlmns).innerJoin(plmns, eq(plmns.id, cellPlmns.plmnId)).where(inArray(plmns.code, codes)),
  );
  return or(ownedWithoutCode, ownedByCode, broadcastByCode)!;
}

function getCellIdentityDuplicateEntriesByRat(
  sources: CellIdentityDuplicateSource[],
  owner: NetworkOwner,
): Map<string, CellIdentityDuplicateEntry[]> {
  const entriesByRat = new Map<string, CellIdentityDuplicateEntry[]>();

  for (const source of sources) {
    const spec = getCellIdentityDuplicateSpec(source.rat);
    if (!spec || !source.details) continue;
    const details = toIdentityDetails(spec, source.details);
    if (isUnknownCellIdentity(spec, details)) continue;

    const values: Record<string, number> = {};
    for (const { field } of spec.fields) {
      const value = details[field];
      if (typeof value === "number") values[field] = value;
    }
    if (!spec.fields.every(({ field }) => values[field] !== undefined)) continue;

    const duplicateCheck = CELL_IDENTITY_DUPLICATE_CHECKS.find((candidate) => candidate.rat === spec.rat);
    if (!duplicateCheck) continue;

    const entries = entriesByRat.get(spec.rat) ?? [];
    entries.push({ values, excludeCellId: source.excludeCellId, networks: sharesNetwork(owner, source.extraCodes ?? []) });
    entriesByRat.set(spec.rat, entries);
  }

  return entriesByRat;
}

function getPciDuplicateEntriesByRat(sources: PciDuplicateSource[]): Map<string, PciDuplicateEntry[]> {
  const entriesByRat = new Map<string, PciDuplicateEntry[]>();

  for (const source of sources) {
    const duplicateKey = getPciDuplicateKey(source);
    if (!duplicateKey || !source.details || source.bandId === null || source.bandId === undefined) continue;

    const spec = PCI_DUPLICATE_CHECKS.find((candidate) => candidate.rat === duplicateKey.rat);
    if (!spec) continue;
    const entries = entriesByRat.get(duplicateKey.rat) ?? [];
    const entry: PciDuplicateEntry = {
      bandId: source.bandId,
      pci: duplicateKey.pci,
      channel: source.details[spec.channelField] as number | null | undefined,
      excludeCellId: source.excludeCellId,
    };
    if (duplicateKey.rat === "LTE" && source.details.enbid !== null && source.details.enbid !== undefined) entry.enbid = source.details.enbid;
    entries.push(entry);
    entriesByRat.set(duplicateKey.rat, entries);
  }

  return entriesByRat;
}

export async function checkPciDuplicate(stationId: number, source: PciDuplicateSource, siblingExcludeIds: number[] = []): Promise<void> {
  await checkPciDuplicates(stationId, [source], siblingExcludeIds);
}

export async function checkPciDuplicates(stationId: number, sources: PciDuplicateSource[], siblingExcludeIds: number[] = []): Promise<void> {
  const entriesByRat = getPciDuplicateEntriesByRat(sources);
  await Promise.all(
    PCI_DUPLICATE_CHECKS.map((spec) => checkPciDuplicatesForSpec(spec, stationId, entriesByRat.get(spec.rat) ?? [], siblingExcludeIds)),
  );
}

export async function checkCellDuplicate(
  client: DbClient,
  source: CellIdentityDuplicateSource,
  operatorId: number,
  siblingExcludeIds: number[] = [],
): Promise<void> {
  await checkCellDuplicatesBatch(client, [source], operatorId, siblingExcludeIds);
}

export async function checkCellDuplicatesBatch(
  client: DbClient,
  cellEntries: CellIdentityDuplicateSource[],
  operatorId: number,
  siblingExcludeIds: number[] = [],
): Promise<void> {
  await checkOwnerCellDuplicates(client, cellEntries, await loadNetworkOwner(client, operatorId, null), siblingExcludeIds);
}

export async function checkOwnerCellDuplicates(
  client: DbClient,
  cellEntries: CellIdentityDuplicateSource[],
  owner: NetworkOwner,
  siblingExcludeIds: number[] = [],
): Promise<void> {
  const entriesByRat = getCellIdentityDuplicateEntriesByRat(cellEntries, owner);
  await Promise.all(CELL_IDENTITY_DUPLICATE_CHECKS.map((spec) => spec.checkEntries(client, entriesByRat.get(spec.rat) ?? [], siblingExcludeIds)));
}

export async function lockCellIdentities(tx: DbTx, sources: readonly CellIdentityDuplicateSource[]): Promise<void> {
  const keys = new Set(
    sources.flatMap((source) => {
      const identity = getCellIdentityDuplicateKey(source);
      return identity ? [`${identity.rat}:${identity.key}`] : [];
    }),
  );
  if (keys.size === 0) return;

  const hashes = sql.join(
    [...keys].map((key) => sql`(hashtext(${key}))`),
    sql`, `,
  );
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(${CELL_IDENTITY_LOCK_SPACE}::int, hash) FROM (SELECT DISTINCT hash FROM (VALUES ${hashes}) AS identities (hash)) AS locks ORDER BY hash`,
  );
}

export async function lockAndCheckStoredCells(tx: DbTx, { cellIds, stationId }: StoredCellScope): Promise<void> {
  if (cellIds.length === 0 && stationId === null) return;

  const storedCells = await tx.query.cells.findMany({
    where: stationId === null ? { id: { in: [...cellIds] } } : { OR: [{ id: { in: [...cellIds] } }, { station_id: stationId }] },
    with: {
      gsm: true,
      umts: true,
      lte: true,
      nr: true,
      plmns: { with: { plmn: { columns: { code: true } } } },
      station: {
        columns: { operator_id: true, status: true },
        with: { operator: { columns: { id: true }, with: { plmns: { where: { role: "primary" }, columns: { code: true } } } } },
      },
    },
  });
  const entries = storedCells.flatMap(({ station, plmns: extras, ...cell }) => {
    if (station?.status !== "published" || station.operator_id === null) return [];
    const owner: NetworkOwner = { operatorId: station.operator_id, mainCode: station.operator?.plmns[0]?.code ?? null, countryCode: null };
    const details = cell.gsm ?? cell.umts ?? cell.lte ?? cell.nr;
    return [{ owner, rat: cell.rat, details, excludeCellId: cell.id, extraCodes: extras.map(({ plmn }) => plmn.code) }];
  });
  if (entries.length === 0) return;

  const owners = new Map(entries.map(({ owner }) => [owner.operatorId, owner]));
  await lockCellIdentities(tx, entries);
  await Promise.all(
    [...owners.values()].map((owner) =>
      checkOwnerCellDuplicates(
        tx,
        entries.filter((entry) => entry.owner.operatorId === owner.operatorId),
        owner,
      ),
    ),
  );
}

async function checkPciDuplicatesForSpec(
  spec: PciDuplicateCheckSpec,
  stationId: number,
  entries: PciDuplicateEntry[],
  siblingExcludeIds: number[],
): Promise<void> {
  if (entries.length === 0) return;

  const conditions = entries.map((entry) =>
    and(
      eq(cells.band_id, entry.bandId),
      eq(spec.pciColumn, entry.pci),
      spec.enbidColumn !== undefined && entry.enbid !== undefined ? eq(spec.enbidColumn, entry.enbid) : undefined,
      entry.channel !== null && entry.channel !== undefined ? or(isNull(spec.channelColumn), eq(spec.channelColumn, entry.channel)) : undefined,
      entry.excludeCellId !== undefined ? ne(spec.cellIdColumn, entry.excludeCellId) : undefined,
    ),
  );

  const existing = await db
    .select({ pci: spec.pciColumn })
    .from(spec.table)
    .innerJoin(cells, eq(cells.id, spec.cellIdColumn))
    .where(
      and(
        eq(cells.station_id, stationId),
        siblingExcludeIds.length > 0 ? notInArray(spec.cellIdColumn, siblingExcludeIds) : undefined,
        or(...conditions),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    const duplicate = existing[0]!;
    const scope = spec.rat === "LTE" ? "same band and eNBID" : "same band";
    throw new ErrorResponse("DUPLICATE_ENTRY", {
      message: `An ${spec.label} cell with PCI ${duplicate.pci} already exists for this station using the ${scope}`,
    });
  }
}

export async function findCodeIdentityCollisions(client: DbClient, operatorId: number, code: string): Promise<string[]> {
  const broadcastingCode = client
    .select({ id: cellPlmns.cellId })
    .from(cellPlmns)
    .innerJoin(plmns, eq(plmns.id, cellPlmns.plmnId))
    .where(eq(plmns.code, code));
  const collisions = await Promise.all(
    IDENTITY_COLLISION_JOINS.map(({ table, cellId, other, otherCellId, matches, identity }) =>
      client
        .select({ identity, cellId, otherCellId })
        .from(table)
        .innerJoin(cells, eq(cells.id, cellId))
        .innerJoin(stations, eq(stations.id, cells.station_id))
        .innerJoin(other, and(matches, ne(otherCellId, cellId)))
        .innerJoin(otherCells, eq(otherCells.id, otherCellId))
        .innerJoin(otherStations, eq(otherStations.id, otherCells.station_id))
        .where(
          and(
            eq(stations.operator_id, operatorId),
            eq(stations.status, "published"),
            eq(otherStations.status, "published"),
            sql`${otherStations.operator_id} IS DISTINCT FROM ${operatorId}`,
            inArray(otherCells.id, broadcastingCode),
          ),
        )
        .limit(COLLISIONS_NAMED),
    ),
  );
  return collisions
    .flat()
    .slice(0, COLLISIONS_NAMED)
    .map((collision) => `${collision.identity} (cells ${collision.cellId} and ${collision.otherCellId})`);
}

export async function getOperatorIdForStation(stationId: number): Promise<number | null> {
  const station = await db.query.stations.findFirst({
    where: { id: stationId },
    columns: { operator_id: true },
  });
  return station?.operator_id ?? null;
}
