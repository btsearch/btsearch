const LTE_MAX_CLID = 255;
const DEFAULT_LTE_SECTOR_COUNT = 3;
const PLUS_MNC = 26001;
const PLAY_MNC = 26006;
const NETWORKS_MNCS = new Set([26002, 26003]);

type LTECellIdentity = {
  clid: number;
  ecid: number;
  enbid: number;
};

type LTESectorRule = {
  clidStep: number;
  isSequenceStart: (ecid: number) => boolean;
  supportsFourthSector: boolean;
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
  operatorMnc?: number | null;
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

function isPlaySequenceStart(ecid: number): boolean {
  const sectorDigit = Math.floor(ecid / 10) % 10;
  return sectorDigit === 1 || sectorDigit === 4 || sectorDigit === 7;
}

function isConsecutiveSequenceStart(ecid: number): boolean {
  const lastDigit = ecid % 10;
  return lastDigit % DEFAULT_LTE_SECTOR_COUNT === 0;
}

const PLAY_SECTOR_RULE: LTESectorRule = {
  clidStep: 10,
  isSequenceStart: isPlaySequenceStart,
  supportsFourthSector: true,
};

const CONSECUTIVE_SECTOR_RULE = {
  clidStep: 1,
  isSequenceStart: isConsecutiveSequenceStart,
};

const PLUS_SECTOR_RULE: LTESectorRule = {
  ...CONSECUTIVE_SECTOR_RULE,
  supportsFourthSector: true,
};

const NETWORKS_SECTOR_RULE: LTESectorRule = {
  ...CONSECUTIVE_SECTOR_RULE,
  supportsFourthSector: false,
};

function getSectorRule(operatorMnc?: number | null): LTESectorRule | null {
  if (operatorMnc === PLAY_MNC) return PLAY_SECTOR_RULE;
  if (operatorMnc === PLUS_MNC) return PLUS_SECTOR_RULE;
  if (operatorMnc !== null && operatorMnc !== undefined && NETWORKS_MNCS.has(operatorMnc)) return NETWORKS_SECTOR_RULE;
  return null;
}

function getSectorIndex(identity: LTECellIdentity, sequence: LTESectorSequence, rule: LTESectorRule): number | null {
  if (identity.enbid !== sequence.enbid) return null;
  const clidOffset = identity.clid - sequence.startClid;
  if (clidOffset < 0 || clidOffset % rule.clidStep !== 0) return null;
  const sectorIndex = clidOffset / rule.clidStep;
  return sectorIndex < sequence.sectorCount ? sectorIndex : null;
}

function resolveSectorSequence(identities: readonly LTECellIdentity[], rule: LTESectorRule, sectorCount: number): LTESectorSequence | null {
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

function getTargetSectorCount(rule: LTESectorRule, identityGroups: readonly (readonly LTECellIdentity[])[]): number {
  if (!rule.supportsFourthSector) return DEFAULT_LTE_SECTOR_COUNT;
  return identityGroups.some((identities) => resolveSectorSequence(identities, rule, 4)?.matchedSectorCount === 4) ? 4 : DEFAULT_LTE_SECTOR_COUNT;
}

export function supportsRemainingLTECells(operatorMnc?: number | null): boolean {
  return getSectorRule(operatorMnc) !== null;
}

export function createRemainingLTEDetails(details: Readonly<Record<string, unknown>>, clid: number): Record<string, unknown> {
  const next = { ...details };
  delete next.ecid;
  next.clid = clid;
  return next;
}

export function buildRemainingLTECells<T>({ operatorMnc, cells, getBandId, getDetails, createCell }: BuildRemainingLTECellsOptions<T>): T[] {
  const rule = getSectorRule(operatorMnc);
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
