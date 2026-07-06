import { cells, gsmCells, lteCells, nrCells, operators, stations, umtsCells } from "@openbts/drizzle";
import { and, eq, isNull, ne, notInArray, or } from "drizzle-orm";

import db from "../database/psql.js";
import { ErrorResponse } from "../errors.js";
import { type CellIdentityDuplicateDetails, getCellIdentityDuplicateSpec } from "../utils/cellIdentityDuplicateSpecs.js";
import { type PciDuplicateDetails, type PciDuplicateSpec, getPciDuplicateKey, getPciDuplicateSpec } from "../utils/pciDuplicateSpecs.js";

type CellIdentityDuplicateEntry = {
  values: Record<string, number>;
  excludeCellId?: number;
};

export type CellIdentityDuplicateSource = {
  rat?: string | null;
  details?: CellIdentityDuplicateDetails | null;
  excludeCellId?: number;
};

type CellIdentityDuplicateCheck = {
  rat: string;
  checkEntries: (operatorId: number, entries: CellIdentityDuplicateEntry[], siblingExcludeIds: number[]) => Promise<void>;
};

type PciDuplicateEntry = {
  bandId: number;
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
  channelColumn: typeof lteCells.earfcn | typeof nrCells.arfcn;
  label: string;
};

const LTE_SINGLE_ENBID_PER_CLID_MNCS = new Set([26002, 26003]);

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
    checkEntries: async (operatorId, entries, siblingExcludeIds) => {
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
          ),
        ];
      });
      if (conditions.length === 0) return;

      const existing = await db
        .select({ lac: gsmCells.lac, cid: gsmCells.cid })
        .from(gsmCells)
        .innerJoin(cells, eq(cells.id, gsmCells.cell_id))
        .innerJoin(stations, eq(stations.id, cells.station_id))
        .where(
          and(
            eq(stations.operator_id, operatorId),
            siblingExcludeIds.length > 0 ? notInArray(gsmCells.cell_id, siblingExcludeIds) : undefined,
            or(...conditions),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        const duplicate = existing[0]!;
        throw new ErrorResponse("DUPLICATE_ENTRY", {
          message: `A GSM cell with LAC ${duplicate.lac} and CID ${duplicate.cid} already exists for this operator`,
        });
      }
    },
  },
  {
    rat: "UMTS",
    checkEntries: async (operatorId, entries, siblingExcludeIds) => {
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
          ),
        ];
      });
      if (conditions.length === 0) return;

      const existing = await db
        .select({ rnc: umtsCells.rnc, cid: umtsCells.cid })
        .from(umtsCells)
        .innerJoin(cells, eq(cells.id, umtsCells.cell_id))
        .innerJoin(stations, eq(stations.id, cells.station_id))
        .where(
          and(
            eq(stations.operator_id, operatorId),
            siblingExcludeIds.length > 0 ? notInArray(umtsCells.cell_id, siblingExcludeIds) : undefined,
            or(...conditions),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        const duplicate = existing[0]!;
        throw new ErrorResponse("DUPLICATE_ENTRY", {
          message: `A UMTS cell with RNC ${duplicate.rnc} and CID ${duplicate.cid} already exists for this operator`,
        });
      }
    },
  },
  {
    rat: "LTE",
    checkEntries: async (operatorId, entries, siblingExcludeIds) => {
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
          ),
        ];
      });
      if (conditions.length === 0) return;

      const existing = await db
        .select({ enbid: lteCells.enbid, clid: lteCells.clid })
        .from(lteCells)
        .innerJoin(cells, eq(cells.id, lteCells.cell_id))
        .innerJoin(stations, eq(stations.id, cells.station_id))
        .where(
          and(
            eq(stations.operator_id, operatorId),
            siblingExcludeIds.length > 0 ? notInArray(lteCells.cell_id, siblingExcludeIds) : undefined,
            or(...conditions),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        const duplicate = existing[0]!;
        throw new ErrorResponse("DUPLICATE_ENTRY", {
          message: `An LTE cell with eNBID ${duplicate.enbid} and CLID ${duplicate.clid} already exists for this operator`,
        });
      }
    },
  },
];

function getCellIdentityDuplicateEntriesByRat(sources: CellIdentityDuplicateSource[]): Map<string, CellIdentityDuplicateEntry[]> {
  const entriesByRat = new Map<string, CellIdentityDuplicateEntry[]>();

  for (const source of sources) {
    const spec = getCellIdentityDuplicateSpec(source.rat);
    if (!spec || !source.details) continue;

    const values: Record<string, number> = {};
    for (const { field } of spec.fields) {
      const value = source.details[field];
      if (typeof value === "number") values[field] = value;
    }
    if (!spec.fields.every(({ field }) => values[field] !== undefined)) continue;

    const duplicateCheck = CELL_IDENTITY_DUPLICATE_CHECKS.find((candidate) => candidate.rat === spec.rat);
    if (!duplicateCheck) continue;

    const entries = entriesByRat.get(spec.rat) ?? [];
    entries.push({ values, excludeCellId: source.excludeCellId });
    entriesByRat.set(spec.rat, entries);
  }

  return entriesByRat;
}

function getLTEClidEntries(sources: CellIdentityDuplicateSource[]): CellIdentityDuplicateEntry[] {
  return sources.flatMap((source) => {
    if (source.rat !== "LTE" || !source.details) return [];
    const enbid = source.details.enbid;
    const clid = source.details.clid;
    if (typeof enbid !== "number" || typeof clid !== "number") return [];
    return [{ values: { enbid, clid }, excludeCellId: source.excludeCellId }];
  });
}

function assertLTEClidPayloadConsistency(entries: CellIdentityDuplicateEntry[]): void {
  const ENBIDByCLID = new Map<number, number>();

  for (const entry of entries) {
    const enbid = entry.values.enbid;
    const clid = entry.values.clid;
    if (enbid === undefined || clid === undefined) continue;

    const existingENBID = ENBIDByCLID.get(clid);
    if (existingENBID !== undefined && existingENBID !== enbid)
      throw new ErrorResponse("BAD_REQUEST", {
        message: `LTE CLID ${clid} cannot be used with multiple eNBIDs on the same station`,
      });

    ENBIDByCLID.set(clid, enbid);
  }
}

async function getLTEClidConsistencyMNC(stationId: number | null, operatorId?: number | null): Promise<number | null> {
  if (stationId !== null) {
    const [row] = await db
      .select({ mnc: operators.mnc })
      .from(stations)
      .leftJoin(operators, eq(stations.operator_id, operators.id))
      .where(eq(stations.id, stationId))
      .limit(1);
    return row?.mnc ?? null;
  }

  if (operatorId === null || operatorId === undefined) return null;

  const [row] = await db.select({ mnc: operators.mnc }).from(operators).where(eq(operators.id, operatorId)).limit(1);
  return row?.mnc ?? null;
}

function getPciDuplicateEntriesByRat(sources: PciDuplicateSource[]): Map<string, PciDuplicateEntry[]> {
  const entriesByRat = new Map<string, PciDuplicateEntry[]>();

  for (const source of sources) {
    const duplicateKey = getPciDuplicateKey(source);
    if (!duplicateKey || !source.details || source.bandId === null || source.bandId === undefined) continue;

    const spec = PCI_DUPLICATE_CHECKS.find((candidate) => candidate.rat === duplicateKey.rat);
    if (!spec) continue;
    const entries = entriesByRat.get(duplicateKey.rat) ?? [];
    entries.push({
      bandId: source.bandId,
      pci: duplicateKey.pci,
      channel: source.details[spec.channelField] as number | null | undefined,
      excludeCellId: source.excludeCellId,
    });
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

export async function checkGSMDuplicate(lac: number, cid: number, operatorId: number, excludeCellId?: number): Promise<void> {
  await checkCellDuplicate({ rat: "GSM", details: { lac, cid }, excludeCellId }, operatorId);
}

export async function checkUMTSDuplicate(rnc: number, cid: number, operatorId: number, excludeCellId?: number): Promise<void> {
  await checkCellDuplicate({ rat: "UMTS", details: { rnc, cid }, excludeCellId }, operatorId);
}

export async function checkLTEDuplicate(enbid: number, clid: number, operatorId: number, excludeCellId?: number): Promise<void> {
  await checkCellDuplicate({ rat: "LTE", details: { enbid, clid }, excludeCellId }, operatorId);
}

export async function checkCellDuplicate(source: CellIdentityDuplicateSource, operatorId: number, siblingExcludeIds: number[] = []): Promise<void> {
  await checkCellDuplicatesBatch([source], operatorId, siblingExcludeIds);
}

export async function checkCellDuplicatesBatch(
  cellEntries: CellIdentityDuplicateSource[],
  operatorId: number,
  siblingExcludeIds: number[] = [],
): Promise<void> {
  const entriesByRat = getCellIdentityDuplicateEntriesByRat(cellEntries);
  await Promise.all(CELL_IDENTITY_DUPLICATE_CHECKS.map((spec) => spec.checkEntries(operatorId, entriesByRat.get(spec.rat) ?? [], siblingExcludeIds)));
}

export async function checkLTEClidConsistency(
  stationId: number | null,
  sources: CellIdentityDuplicateSource[],
  siblingExcludeIds: number[] = [],
  operatorId?: number | null,
): Promise<void> {
  const entries = getLTEClidEntries(sources);
  if (entries.length === 0) return;

  const mnc = await getLTEClidConsistencyMNC(stationId, operatorId);
  if (!LTE_SINGLE_ENBID_PER_CLID_MNCS.has(mnc ?? 0)) return;

  assertLTEClidPayloadConsistency(entries);
  if (stationId === null) return;

  const conditions = entries.flatMap((entry) => {
    const enbid = entry.values.enbid;
    const clid = entry.values.clid;
    if (enbid === undefined || clid === undefined) return [];
    return [
      and(
        eq(lteCells.clid, clid),
        ne(lteCells.enbid, enbid),
        entry.excludeCellId !== undefined ? ne(lteCells.cell_id, entry.excludeCellId) : undefined,
      ),
    ];
  });
  if (conditions.length === 0) return;

  const existing = await db
    .select({ enbid: lteCells.enbid, clid: lteCells.clid })
    .from(lteCells)
    .innerJoin(cells, eq(cells.id, lteCells.cell_id))
    .where(
      and(
        eq(cells.station_id, stationId),
        siblingExcludeIds.length > 0 ? notInArray(lteCells.cell_id, siblingExcludeIds) : undefined,
        or(...conditions),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    const duplicate = existing[0]!;
    throw new ErrorResponse("DUPLICATE_ENTRY", {
      message: `LTE CLID ${duplicate.clid} already belongs to eNBID ${duplicate.enbid} on this station`,
    });
  }
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
    throw new ErrorResponse("DUPLICATE_ENTRY", {
      message: `An ${spec.label} cell with PCI ${duplicate.pci} already exists on this band for this station`,
    });
  }
}

export async function getOperatorIdForStation(stationId: number): Promise<number | null> {
  const station = await db.query.stations.findFirst({
    where: { id: stationId },
    columns: { operator_id: true },
  });
  return station?.operator_id ?? null;
}
