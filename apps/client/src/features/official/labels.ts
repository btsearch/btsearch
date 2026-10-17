import type { OfficialPermitLabel, OfficialRat, OfficialRatFilter } from "@openbts/shared/contract";

type OfficialRatOption = { value: OfficialRatFilter; label: string; gen: string };
export type OfficialLabelParts = Pick<OfficialPermitLabel, "rat" | "labelMhz" | "variant">;
export type OfficialRatComparator = (left: OfficialRat | null, right: OfficialRat | null) => number;
export type OfficialLabelComparator = (left: OfficialLabelParts, right: OfficialLabelParts) => number;

const UNLISTED_POSITION = Number.MAX_SAFE_INTEGER;
const OFFICIAL_RAT_OPTIONS: Readonly<Record<OfficialRatFilter, OfficialRatOption>> = {
  nr: { value: "nr", label: "NR", gen: "5G" },
  lte: { value: "lte", label: "LTE", gen: "4G" },
  umts: { value: "umts", label: "UMTS", gen: "3G" },
  cdma: { value: "cdma", label: "CDMA", gen: "3G" },
  gsm: { value: "gsm", label: "GSM", gen: "2G" },
  gsmR: { value: "gsmR", label: "GSM-R", gen: "2G" },
  iot: { value: "iot", label: "IoT", gen: "NB" },
};

function listPositions<T>(values: readonly T[]): Map<T, number> {
  return new Map([...new Set(values)].map((value, index) => [value, index]));
}

function comparePositions<T>(positions: ReadonlyMap<T, number>, left: T, right: T): number {
  return (positions.get(left) ?? UNLISTED_POSITION) - (positions.get(right) ?? UNLISTED_POSITION);
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true });
}

function compareRatNames(left: OfficialRat | null, right: OfficialRat | null): number {
  if (left === null || right === null) return Number(left === null) - Number(right === null);
  return compareText(left, right);
}

export function toOfficialRatFilter(label: Pick<OfficialPermitLabel, "rat" | "variant">): OfficialRatFilter | null {
  if (label.rat === null) return null;
  return label.rat === "gsm" && label.variant === "railway" ? "gsmR" : label.rat;
}

export function toOfficialRatOption(rat: OfficialRatFilter): OfficialRatOption {
  return OFFICIAL_RAT_OPTIONS[rat];
}

export function listOfficialRatOptions(labels: readonly Pick<OfficialPermitLabel, "rat" | "variant">[]): OfficialRatOption[] {
  const rats = labels.flatMap((label) => {
    const rat = toOfficialRatFilter(label);
    return rat === null ? [] : [rat];
  });
  return [...new Set(rats)].map(toOfficialRatOption);
}

export function listOfficialLabelMhz(labels: readonly Pick<OfficialPermitLabel, "labelMhz">[]): number[] {
  const values = labels.flatMap(({ labelMhz }) => (labelMhz !== null && labelMhz > 0 ? [labelMhz] : []));
  return [...new Set(values)].sort((left, right) => left - right);
}

export function toOfficialLabelKey({ rat, labelMhz, variant }: OfficialLabelParts): string {
  return `${rat}:${labelMhz}:${variant}`;
}

export function toOfficialRatComparator(labels: readonly Pick<OfficialPermitLabel, "rat">[]): OfficialRatComparator {
  const positions = listPositions(labels.map(({ rat }) => rat));
  return (left, right) => comparePositions(positions, left, right) || compareRatNames(left, right);
}

export function toOfficialLabelComparator(labels: readonly OfficialLabelParts[]): OfficialLabelComparator {
  const positions = listPositions(labels.map(toOfficialLabelKey));
  return (left, right) => {
    const leftKey = toOfficialLabelKey(left);
    const rightKey = toOfficialLabelKey(right);
    return comparePositions(positions, leftKey, rightKey) || compareText(leftKey, rightKey);
  };
}
