import { GNBID_MAX_LENGTH, GNBID_MIN_LENGTH, MAX_LATITUDE, MAX_LONGITUDE } from "@openbts/shared/contract/constants";

import { ANALYZER_NR_MAX } from "./analyzerImport";
import type { NrAnchor, ParsedRow } from "./analyzerParsers";

type CelldexToken = { key: string | null; value: string; isQuoted: boolean };
type TokenizedLine = { text: string; tokens: CelldexToken[] | null };
type CellRecord = "gsm" | "umts" | "lte" | "nr";
type CelldexSite = { plmn: string | null; name: string; anchor: NrAnchor | null; nonStandaloneRows: NrRow[] };
type CellLine = { text: string; record: CellRecord; tokens: readonly CelldexToken[]; siteName: string; plmn: string };
type UmtsRow = Extract<ParsedRow, { rat: "UMTS" }>;
type LteRow = Extract<ParsedRow, { rat: "LTE" }>;
type NrRow = Extract<ParsedRow, { rat: "NR" }>;
type TokenValues = ReadonlyMap<string, CelldexToken>;
type CelldexReading = { rows: ParsedRow[]; skippedLines: number };

class UnreadableLineError extends Error {}

const HEADER_WORD = "celldex";
const CELLDEX_VERSION = "1";
const NET_RECORD = "net";
const SITE_RECORD = "site";
const NON_STANDALONE_FLAG = "nsa";
const DELETED_FLAG = "deleted";
const UNKNOWN_VALUE = "-";
const IDENTITY_SEPARATOR = "/";
const LIST_SEPARATOR = ",";
const OMNI_AZIMUTH = "omni";
const PLMN_PATTERN = /^\d{5,6}$/;
const NUMBER_PATTERN = /^\d{1,18}$/;
const COORDINATE_PATTERN = /^-?(\d+(\.\d*)?|\.\d+)$/;
const FIRST_WORD_PATTERN = /^[ \t]*([^ \t#"=]+)/;
const ESCAPES: Readonly<Partial<Record<string, string>>> = { '"': '"', "\\": "\\", n: "\n", t: "\t" };
const NCI_BITS = 36;
const MAX_16_BIT = 65_535;
const VALUE_MAX = { ltePci: 503, bsic: 63, psc: 511, band: 1024, azimuth: 359 } as const;
const IDENTITY_MAX = {
  gsm: [MAX_16_BIT, MAX_16_BIT],
  umts: [4095, MAX_16_BIT],
  lte: [1_048_575, 255],
} as const;
const CHANNEL_MAX: Readonly<Record<CellRecord, number>> = { gsm: 1023, umts: 16_383, lte: 262_143, nr: ANALYZER_NR_MAX.arfcn };

function refuse(): never {
  throw new UnreadableLineError();
}

function isTokenEnd(char: string | undefined): boolean {
  return char === undefined || char === " " || char === "\t" || char === "#";
}

function isWordStop(char: string): boolean {
  return char === " " || char === "\t" || char === "#" || char === '"';
}

function findWordEnd(line: string, start: number, stopsAtEquals: boolean): number {
  let index = start;
  while (index < line.length && !isWordStop(line[index]) && !(stopsAtEquals && line[index] === "=")) index++;
  return index;
}

function readQuoted(line: string, start: number): { text: string; end: number } | null {
  let text = "";
  for (let index = start + 1; index < line.length; index++) {
    const char = line[index];
    if (char === '"') return isTokenEnd(line[index + 1]) ? { text, end: index + 1 } : null;
    if (char !== "\\") {
      text += char;
      continue;
    }
    if (index + 1 === line.length) return null;
    const escaped = line[index + 1];
    text += ESCAPES[escaped] ?? `\\${escaped}`;
    index++;
  }
  return null;
}

function tokenize(line: string): CelldexToken[] | null {
  const tokens: CelldexToken[] = [];
  let index = 0;
  while (index < line.length) {
    const char = line[index];
    if (char === "#") break;
    if (char === " " || char === "\t") {
      index++;
      continue;
    }
    if (char === '"') {
      const quoted = readQuoted(line, index);
      if (quoted === null) return null;
      tokens.push({ key: null, value: quoted.text, isQuoted: true });
      index = quoted.end;
      continue;
    }

    const wordEnd = findWordEnd(line, index, true);
    if (line[wordEnd] === '"') return null;
    if (line[wordEnd] !== "=") {
      tokens.push({ key: null, value: line.slice(index, wordEnd), isQuoted: false });
      index = wordEnd;
      continue;
    }
    if (wordEnd === index) return null;

    const key = line.slice(index, wordEnd).toLowerCase();
    const valueStart = wordEnd + 1;
    if (line[valueStart] === '"') {
      const quoted = readQuoted(line, valueStart);
      if (quoted === null) return null;
      tokens.push({ key, value: quoted.text, isQuoted: true });
      index = quoted.end;
      continue;
    }
    const valueEnd = findWordEnd(line, valueStart, false);
    if (line[valueEnd] === '"') return null;
    tokens.push({ key, value: line.slice(valueStart, valueEnd), isQuoted: false });
    index = valueEnd;
  }
  return tokens;
}

function isBareWord(token: CelldexToken | undefined): token is CelldexToken {
  return token !== undefined && token.key === null && !token.isQuoted;
}

function splitLines(text: string): string[] {
  return text.split("\n").map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));
}

function isHeaderLine(line: string): boolean {
  const [word, version] = tokenize(line) ?? [];
  return isBareWord(word) && word.value === HEADER_WORD && isBareWord(version) && version.value === CELLDEX_VERSION;
}

function isBlankOrComment(line: string): boolean {
  return tokenize(line)?.length === 0;
}

export function isCelldexHead(head: string): boolean {
  const firstLine = splitLines(head).find((line) => !isBlankOrComment(line));
  return firstLine !== undefined && isHeaderLine(firstLine);
}

function isUnknown(token: CelldexToken): boolean {
  return token.value === "" || (!token.isQuoted && token.value === UNKNOWN_VALUE);
}

function readNumber(text: string, max: number): number {
  if (!NUMBER_PATTERN.test(text)) refuse();
  const value = Number(text);
  return value <= max ? value : refuse();
}

function readOptionalNumber(token: CelldexToken | undefined, max: number): number | undefined {
  return token === undefined || isUnknown(token) ? undefined : readNumber(token.value, max);
}

function checkList(token: CelldexToken | undefined, isValid: (part: string) => boolean): void {
  if (token === undefined || isUnknown(token)) return;
  if (!token.value.split(LIST_SEPARATOR).every((part) => isValid(part.trim()))) refuse();
}

function isBandNumber(text: string): boolean {
  return NUMBER_PATTERN.test(text) && Number(text) >= 1 && Number(text) <= VALUE_MAX.band;
}

function checkCellKeys(record: CellRecord, values: TokenValues): void {
  checkList(values.get("band"), isBandNumber);
  checkList(values.get("plmns"), (part) => PLMN_PATTERN.test(part));
  const azimuth = values.get("az");
  if (azimuth !== undefined && azimuth.value.toLowerCase() !== OMNI_AZIMUTH) readOptionalNumber(azimuth, VALUE_MAX.azimuth);
  if (record === "gsm") readOptionalNumber(values.get("bsic"), VALUE_MAX.bsic);
  if (record === "umts") readOptionalNumber(values.get("psc"), VALUE_MAX.psc);
}

function keyedValues(tokens: readonly CelldexToken[]): Map<string, CelldexToken> {
  return new Map(tokens.flatMap((token) => (token.key === null ? [] : [[token.key, token] as const])));
}

function flagsOf(tokens: readonly CelldexToken[]): Set<string> {
  return new Set(tokens.filter(isBareWord).map((token) => token.value.toLowerCase()));
}

function readPair(text: string, [firstMax, secondMax]: readonly [number, number]): [number, number] {
  const separator = text.indexOf(IDENTITY_SEPARATOR);
  if (separator <= 0) refuse();
  return [readNumber(text.slice(0, separator), firstMax), readNumber(text.slice(separator + 1), secondMax)];
}

function readGnbLength(token: CelldexToken | undefined): number | undefined {
  const length = readOptionalNumber(token, GNBID_MAX_LENGTH);
  return length !== undefined && length < GNBID_MIN_LENGTH ? refuse() : length;
}

function checkCoordinate(text: string, max: number): void {
  if (!COORDINATE_PATTERN.test(text) || Math.abs(Number(text)) > max) refuse();
}

function readSite(tokens: readonly CelldexToken[]): CelldexSite {
  const [, plmnToken, latitudeToken, longitudeToken, nameToken] = tokens;
  if (!isBareWord(plmnToken) || !isBareWord(latitudeToken) || !isBareWord(longitudeToken)) refuse();

  const plmn = plmnToken.value === UNKNOWN_VALUE ? null : plmnToken.value;
  if (plmn !== null && !PLMN_PATTERN.test(plmn)) refuse();
  if (latitudeToken.value !== UNKNOWN_VALUE || longitudeToken.value !== UNKNOWN_VALUE) {
    checkCoordinate(latitudeToken.value, MAX_LATITUDE);
    checkCoordinate(longitudeToken.value, MAX_LONGITUDE);
  }

  const namedToken = nameToken?.key === null && nameToken.isQuoted ? nameToken : keyedValues(tokens).get("name");
  return { plmn, name: namedToken?.value ?? "", anchor: null, nonStandaloneRows: [] };
}

function readNetLine(tokens: readonly CelldexToken[], gnbLengths: Map<string, number>): void {
  const [, plmnToken] = tokens;
  if (!isBareWord(plmnToken) || !PLMN_PATTERN.test(plmnToken.value)) refuse();
  const length = readGnbLength(keyedValues(tokens).get("gnb"));
  if (length === undefined) return;

  const known = gnbLengths.get(plmnToken.value);
  if (known !== undefined && known !== length) refuse();
  gnbLengths.set(plmnToken.value, length);
}

function identityOf(record: CellRecord, token: CelldexToken | undefined, values: TokenValues): string {
  if (isBareWord(token)) return token.value;
  return record === "nr" && values.has("nci") ? UNKNOWN_VALUE : refuse();
}

function readNci(identity: string, values: TokenValues, gnbLength: number | undefined): number | undefined {
  const nci = readOptionalNumber(values.get("nci"), ANALYZER_NR_MAX.nci);
  if (identity === UNKNOWN_VALUE) return nci;

  const length = gnbLength ?? refuse();
  const cellBits = NCI_BITS - length;
  const [gnbid, clid] = readPair(identity, [2 ** length - 1, 2 ** cellBits - 1]);
  const splitNci = gnbid * 2 ** cellBits + clid;
  return nci === undefined || nci === splitNci ? splitNci : refuse();
}

function readNrRow(row: NrRow, identity: string, values: TokenValues, isNonStandalone: boolean, networkGnbLength: number | undefined): NrRow | null {
  const tac = readOptionalNumber(values.get("tac"), ANALYZER_NR_MAX.tac);
  const pci = readOptionalNumber(values.get("pci"), ANALYZER_NR_MAX.pci);
  const nci = readNci(identity, values, readGnbLength(values.get("gnb")) ?? networkGnbLength);
  if (tac !== undefined) row.tac = tac;
  if (pci !== undefined) row.pci = pci;
  if (nci !== undefined) {
    row.nci = nci;
    return row;
  }
  return isNonStandalone && pci !== undefined && row.arfcn !== undefined ? row : null;
}

function readCellRow(line: CellLine, gnbLengths: ReadonlyMap<string, number>): ParsedRow | null {
  const { record, tokens, plmn } = line;
  const values = keyedValues(tokens.slice(1));
  const identity = identityOf(record, tokens[1], values);
  const flags = flagsOf(tokens.slice(2));
  if (flags.has(DELETED_FLAG)) return null;

  checkCellKeys(record, values);
  const channel = readOptionalNumber(values.get("ch"), CHANNEL_MAX[record]);
  const name = values.get("name")?.value ?? "";
  const base = {
    mnc: Number(plmn.slice(0, 3)) * 100 + Number(plmn.slice(3)),
    plmn,
    description: name === "" ? line.siteName : name,
    rawLine: line.text,
  };

  switch (record) {
    case "gsm": {
      if (identity === UNKNOWN_VALUE) return null;
      const [lac, cid] = readPair(identity, IDENTITY_MAX.gsm);
      return { ...base, rat: "GSM", lac, cid };
    }
    case "umts": {
      const lac = readOptionalNumber(values.get("lac"), MAX_16_BIT);
      if (identity === UNKNOWN_VALUE) return null;
      const [rnc, cid] = readPair(identity, IDENTITY_MAX.umts);
      const row: UmtsRow = { ...base, rat: "UMTS", cid, rnc };
      if (lac !== undefined) row.lac = lac;
      if (channel !== undefined) row.uarfcn = channel;
      return row;
    }
    case "lte": {
      const tac = readOptionalNumber(values.get("tac"), MAX_16_BIT);
      const pci = readOptionalNumber(values.get("pci"), VALUE_MAX.ltePci);
      if (identity === UNKNOWN_VALUE) return null;
      const [enbid, clid] = readPair(identity, IDENTITY_MAX.lte);
      const row: LteRow = { ...base, rat: "LTE", enbid, clid };
      if (tac !== undefined) row.tac = tac;
      if (pci !== undefined) row.pci = pci;
      if (channel !== undefined) row.earfcn = channel;
      return row;
    }
    case "nr": {
      const row: NrRow = { ...base, rat: "NR" };
      if (channel !== undefined) row.arfcn = channel;
      return readNrRow(row, identity, values, flags.has(NON_STANDALONE_FLAG), gnbLengths.get(plmn));
    }
  }
}

function anchorOf({ enbid, clid, tac }: LteRow): NrAnchor {
  return tac === undefined ? { enbid, clid } : { enbid, clid, tac };
}

function anchorNonStandaloneRows(site: CelldexSite | null): void {
  if (site === null || site.anchor === null) return;
  for (const row of site.nonStandaloneRows) row.anchor = site.anchor;
}

function readLines(text: string): TokenizedLine[] {
  const lines = splitLines(text);
  const headerIndex = lines.findIndex((line) => !isBlankOrComment(line));
  return lines.slice(headerIndex + 1).map((line) => ({ text: line, tokens: tokenize(line) }));
}

function recordOf({ text, tokens }: TokenizedLine): string | null {
  if (tokens === null) return FIRST_WORD_PATTERN.exec(text)?.[1]?.toLowerCase() ?? null;
  const [first] = tokens;
  return isBareWord(first) ? first.value.toLowerCase() : null;
}

function isCellRecord(record: string): record is CellRecord {
  return Object.hasOwn(CHANNEL_MAX, record);
}

export function parseCelldexFile(text: string): CelldexReading {
  const lines = readLines(text);
  const rows: ParsedRow[] = [];
  const gnbLengths = new Map<string, number>();
  let skippedLines = 0;
  let site: CelldexSite | null = null;
  let isSiteUnreadable = false;

  function attempt<T>(read: () => T): T | null {
    try {
      return read();
    } catch (error) {
      if (!(error instanceof UnreadableLineError)) throw error;
      skippedLines++;
      return null;
    }
  }

  for (const line of lines) {
    const { tokens } = line;
    if (tokens !== null && recordOf(line) === NET_RECORD) attempt(() => readNetLine(tokens, gnbLengths));
  }

  for (const line of lines) {
    const { text: lineText, tokens } = line;
    if (tokens !== null && tokens.length === 0) continue;
    const record = recordOf(line);
    if (record === SITE_RECORD) {
      anchorNonStandaloneRows(site);
      site = attempt(() => readSite(tokens ?? refuse()));
      isSiteUnreadable = site === null;
      continue;
    }
    if (tokens === null || record === null) {
      skippedLines++;
      continue;
    }
    if (!isCellRecord(record)) continue;

    if (site === null || site.plmn === null) {
      if (isSiteUnreadable) skippedLines++;
      continue;
    }
    const cellLine: CellLine = { text: lineText, record, tokens, siteName: site.name, plmn: site.plmn };
    const row = attempt(() => readCellRow(cellLine, gnbLengths));
    if (row === null) continue;

    rows.push(row);
    if (row.rat === "LTE") site.anchor ??= anchorOf(row);
    if (row.rat === "NR" && row.nci === undefined) site.nonStandaloneRows.push(row);
  }
  anchorNonStandaloneRows(site);
  return { rows, skippedLines };
}
