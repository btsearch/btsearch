export const getOperatorColor = (mnc: number): string => {
  switch (mnc) {
    case 26002:
      return "#E2007A"; // T-Mobile - Magenta
    case 26003:
      return "#F59E0B"; // Orange
    case 26001:
      return "#24B570"; // Plus - Green
    case 26006:
      return "#8549CE"; // Play - Purple
    case 26034:
      return "#A2334C"; // NetWorks - Dark Red
    case 26018:
      return "#0E4AC0"; // PGE Systemy - Blue
    case 26035:
      return "#0082F4"; // PKP PLK - Light Blue
    default:
      return "#00E1FF"; // blue
  }
};

const OPERATOR_NAME_TO_MNC: Record<string, number> = {
  orange: 26003,
  "orange polska": 26003,
  "t-mobile": 26002,
  "t-mobile polska": 26002,
  polkomtel: 26001,
  plus: 26001,
  "towerlink poland": 26001,
  p4: 26006,
  play: 26006,
  NetWorks: 26034,
  aero2: 26016,
};

export function resolveOperatorMnc(mnc?: number | null, name?: string | null): number | null {
  if (mnc) return mnc;
  if (!name) return null;
  return OPERATOR_NAME_TO_MNC[name.toLowerCase().trim()] ?? null;
}

const DEFAULT_OPERATOR_COLOR = "#00E1FF";

const OPERATOR_NAME_TO_COLOR: Record<string, string> = {
  orange: "#F59E0B",
  "orange polska": "#F59E0B",
  "t-mobile": "#E2007A",
  "t-mobile polska": "#E2007A",
  plus: "#24B570",
  polkomtel: "#24B570",
  "towerlink poland": "#24B570",
  play: "#8549CE",
  p4: "#8549CE",
  networks: "#A2334C",
  "pge systemy": "#0E4AC0",
  "pkp plk": "#0082F4",
  "pkp polskie linie kolejowe": "#0082F4",
};

export function getOperatorColorByName(name?: string | null): string {
  if (!name) return DEFAULT_OPERATOR_COLOR;
  return OPERATOR_NAME_TO_COLOR[name.toLowerCase().trim()] ?? DEFAULT_OPERATOR_COLOR;
}

export function normalizeOperatorName(name: string): string {
  return name.toLowerCase().replace(/(?:^|\s|-)\w/g, (char) => char.toUpperCase());
}

export const TOP4_MNCS = [26001, 26002, 26003, 26006]; // Plus, T-Mobile, Orange, Play
export const EXTRA_IDENTIFICATORS_MNCS = [26002, 26003]; // T-Mobile, Orange
export const MNO_NAME_ONLY_MNCS = [26001, 26006]; // Plus, Play

export const MNO_BRAND: Record<number, string> = {
  26003: "OPL",
  26002: "TMPL",
  26001: "Plus",
  26006: "Play",
};

export function getMnoBrand(mnc?: number | null): string {
  return (mnc !== null && mnc !== undefined ? MNO_BRAND[mnc] : undefined) ?? "MNO";
}

export function getOperatorSortIndex(mnc: number | null | undefined): number {
  if (mnc == null) return TOP4_MNCS.length;
  const idx = TOP4_MNCS.indexOf(mnc);
  return idx === -1 ? TOP4_MNCS.length : idx;
}
