import { type LteSectorRule, type OperatorRef, conventionsFor } from "@openbts/country-packs";

const LTE_MAX_CLID = 255;
const DEFAULT_LTE_SECTOR_COUNT = 3;

type LTECellIdentity = {
  clid: number;
  ecid: number;
  enbid: number;
};

type LTECellSeed<T> = {
  cell: T;
  identity: LTECellIdentity;
};

type LTESectorSequence = {
  enbid: number;
  startClid: number;
  sectorCount: number;
  matchedSectorCount: number;
};

type BuildRemainingLTECellsOptions<T> = {
  countryCode: string | null;
  operator: OperatorRef | null;
  cells: readonly T[];
  getBandId: (cell: T) => number | null;
  getDetails: (cell: T) => Readonly<Record<string, unknown>>;
  createCell: (source: T, clid: number) => T | null;
};

function getECID(enbid: number, clid: number): number {
  return enbid * 256 + clid;
}

function getLTEIdentity(details: Readonly<Record<string, unknown>>): LTECellIdentity | null {
  const { clid, enbid } = details;
  if (typeof clid !== "number" || !Number.isInteger(clid) || clid < 0 || clid > LTE_MAX_CLID) return null;
  if (typeof enbid !== "number" || !Number.isInteger(enbid) || enbid <= 0) return null;

  const ecid = getECID(enbid, clid);
  if (!Number.isSafeInteger(ecid)) return null;
  return { clid, ecid, enbid };
}

function getSectorRule(countryCode: string | null, operator: OperatorRef | null): LteSectorRule | null {
  return operator === null ? null : conventionsFor(countryCode).lteSectorRule(operator);
}

function getSectorIndex(identity: LTECellIdentity, sequence: LTESectorSequence, rule: LteSectorRule): number | null {
  if (identity.enbid !== sequence.enbid) return null;
  const clidOffset = identity.clid - sequence.startClid;
  if (clidOffset < 0 || clidOffset % rule.clidStep !== 0) return null;
  const sectorIndex = clidOffset / rule.clidStep;
  return sectorIndex < sequence.sectorCount ? sectorIndex : null;
}

function resolveSectorSequence(identities: readonly LTECellIdentity[], rule: LteSectorRule, sectorCount: number): LTESectorSequence | null {
  const candidates = new Map<string, Pick<LTESectorSequence, "enbid" | "startClid">>();

  for (const identity of identities) {
    for (let sectorIndex = 0; sectorIndex < sectorCount; sectorIndex++) {
      const startClid = identity.clid - sectorIndex * rule.clidStep;
      const lastClid = startClid + (sectorCount - 1) * rule.clidStep;
      if (startClid < 0 || lastClid > LTE_MAX_CLID) continue;
      if (!rule.isSequenceStart(getECID(identity.enbid, startClid))) continue;
      candidates.set(`${identity.enbid}:${startClid}`, { enbid: identity.enbid, startClid });
    }
  }

  let best: LTESectorSequence | null = null;
  let hasTie = false;

  for (const candidate of candidates.values()) {
    const sequence = { ...candidate, sectorCount, matchedSectorCount: 0 };
    const matchedClids = new Set<number>();
    for (const identity of identities) {
      if (getSectorIndex(identity, sequence, rule) !== null) matchedClids.add(identity.clid);
    }
    sequence.matchedSectorCount = matchedClids.size;

    if (best === null || sequence.matchedSectorCount > best.matchedSectorCount) {
      best = sequence;
      hasTie = false;
    } else if (sequence.matchedSectorCount === best.matchedSectorCount) hasTie = true;
  }

  return hasTie ? null : best;
}

function getTargetSectorCount(rule: LteSectorRule, identityGroups: readonly (readonly LTECellIdentity[])[]): number {
  if (!rule.supportsFourthSector) return DEFAULT_LTE_SECTOR_COUNT;
  return identityGroups.some((identities) => resolveSectorSequence(identities, rule, 4)?.matchedSectorCount === 4) ? 4 : DEFAULT_LTE_SECTOR_COUNT;
}

export function supportsRemainingLTECells(countryCode: string | null, operator: OperatorRef | null): boolean {
  return getSectorRule(countryCode, operator) !== null;
}

export function buildRemainingLTECells<T>({
  countryCode,
  operator,
  cells,
  getBandId,
  getDetails,
  createCell,
}: BuildRemainingLTECellsOptions<T>): T[] {
  const rule = getSectorRule(countryCode, operator);
  if (rule === null) return [];

  const usedEcids = new Set<number>();
  const seedsByBand = new Map<number, LTECellSeed<T>[]>();

  for (const cell of cells) {
    const identity = getLTEIdentity(getDetails(cell));
    if (identity === null) continue;
    usedEcids.add(identity.ecid);

    const bandId = getBandId(cell);
    if (bandId === null) continue;
    const group = seedsByBand.get(bandId);
    const seed = { cell, identity };
    if (group) group.push(seed);
    else seedsByBand.set(bandId, [seed]);
  }

  const identityGroups = [...seedsByBand.values()].map((group) => group.map((seed) => seed.identity));
  const sectorCount = getTargetSectorCount(rule, identityGroups);
  const additions: T[] = [];

  for (const group of seedsByBand.values()) {
    const sequence = resolveSectorSequence(
      group.map((seed) => seed.identity),
      rule,
      sectorCount,
    );
    if (sequence === null) continue;
    if (!rule.supportsFourthSector && group.some((seed) => getSectorIndex(seed.identity, sequence, rule) === null)) continue;
    const source = group.find((seed) => getSectorIndex(seed.identity, sequence, rule) !== null);
    if (source === undefined) continue;

    for (let sectorIndex = 0; sectorIndex < sectorCount; sectorIndex++) {
      const clid = sequence.startClid + sectorIndex * rule.clidStep;
      const ecid = getECID(sequence.enbid, clid);
      if (usedEcids.has(ecid)) continue;

      const added = createCell(source.cell, clid);
      if (added === null) break;
      additions.push(added);
      usedEcids.add(ecid);
    }
  }

  return additions;
}
