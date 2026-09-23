const EARFCN_MAP: Record<number, Partial<Record<number, { fdd?: number; tdd?: number }>>> = {
  26001: {
    900: { fdd: 3526 },
    1800: { fdd: 1355 },
    2100: { fdd: 350 },
    2600: { fdd: 2850, tdd: 37900 },
  },
  26002: {
    800: { fdd: 6375 },
    900: { fdd: 3686 },
    1800: { fdd: 1575 },
    2100: { fdd: 225 },
    2600: { fdd: 3175 },
  },
  26003: {
    700: { fdd: 9310 },
    800: { fdd: 6200 },
    900: { fdd: 3764 },
    1800: { fdd: 1725 },
    2100: { fdd: 75 },
    2600: { fdd: 3025 },
  },
  26006: {
    700: { fdd: 9460 },
    800: { fdd: 6275 },
    900: { fdd: 3476 },
    1800: { fdd: 1875 },
    2100: { fdd: 525 },
    2600: { fdd: 3350 },
  },
};

export function getKnownEARFCN(
  mnc: number | null | undefined,
  bandValue: number | null | undefined,
  duplex: string | null | undefined,
): number | null {
  if (!mnc || !bandValue || !duplex) return null;
  const entry = EARFCN_MAP[mnc]?.[bandValue];
  if (!entry) return null;
  const val = duplex === "TDD" ? entry.tdd : entry.fdd;
  if (val === undefined) return null;
  return val;
}
