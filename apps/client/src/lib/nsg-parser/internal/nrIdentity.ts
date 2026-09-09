import type { NsgCell, NsgJsonObject } from "../model";

const NR_NCI_BITS = 36;
const DEFAULT_GNBID_LENGTH = 24;
const MIN_GNBID_LENGTH = 22;
const MAX_GNBID_LENGTH = 32;
const MAX_GNBID = 0xffffffff;
const MAX_CLID = 0x3fff;
const MAX_NCI = 0x0fffffffff;

export type NsgNrIdentity = Pick<NsgCell, "gnbid" | "gnbidLength" | "clid" | "nrIdentitySource">;

function integerInRange(value: unknown, maximum: number): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= maximum ? value : null;
}

function reportedGnbidLength(raw: NsgJsonObject): number | null {
  const candidates = [raw.gnbidLength, raw.gnbIdLength, raw.gnbid_length, raw["gnbid-length"], raw["gnb-id-length"]];
  for (const candidate of candidates) {
    const length = integerInRange(candidate, MAX_GNBID_LENGTH);
    if (length !== null && length >= MIN_GNBID_LENGTH) return length;
  }
  return null;
}

function nullIdentity(): NsgNrIdentity {
  return { gnbid: null, gnbidLength: null, clid: null, nrIdentitySource: null };
}

function fitsReportedLength(gnbid: number, clid: number, length: number): boolean {
  return gnbid < 2 ** length && clid < 2 ** (NR_NCI_BITS - length);
}

export function resolveNrIdentity(raw: NsgJsonObject, nci: number | null): NsgNrIdentity {
  const reportedGnbid = integerInRange(raw.gnbid, MAX_GNBID);
  const reportedClid = integerInRange(raw.clid, MAX_CLID);
  const reportedLength = reportedGnbidLength(raw);

  if (reportedGnbid !== null && reportedClid !== null)
    return {
      gnbid: reportedGnbid,
      gnbidLength: reportedLength !== null && fitsReportedLength(reportedGnbid, reportedClid, reportedLength) ? reportedLength : null,
      clid: reportedClid,
      nrIdentitySource: "reported",
    };

  if (nci === null || !Number.isSafeInteger(nci) || nci <= 0 || nci > MAX_NCI) return nullIdentity();
  const gnbidLength = reportedLength ?? DEFAULT_GNBID_LENGTH;
  const clidRadix = 2 ** (NR_NCI_BITS - gnbidLength);
  return {
    gnbid: Math.floor(nci / clidRadix),
    gnbidLength,
    clid: nci % clidRadix,
    nrIdentitySource: reportedLength === null ? "derived-default-24" : "derived-reported-length",
  };
}
