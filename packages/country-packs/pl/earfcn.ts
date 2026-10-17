import { ORANGE_PLMN, PLAY_PLMN, PLUS_PLMN, TMOBILE_PLMN } from "./operators.ts";

const DEFAULT_LTE_EARFCNS: Readonly<Record<string, Readonly<Record<number, { FDD?: number; TDD?: number }>>>> = {
  [PLUS_PLMN]: {
    900: { FDD: 3526 },
    1800: { FDD: 1355 },
    2100: { FDD: 350 },
    2600: { FDD: 2850, TDD: 37900 },
  },
  [TMOBILE_PLMN]: {
    800: { FDD: 6375 },
    900: { FDD: 3686 },
    1800: { FDD: 1575 },
    2100: { FDD: 225 },
    2600: { FDD: 3175 },
  },
  [ORANGE_PLMN]: {
    700: { FDD: 9310 },
    800: { FDD: 6200 },
    900: { FDD: 3764 },
    1800: { FDD: 1725 },
    2100: { FDD: 75 },
    2600: { FDD: 3025 },
  },
  [PLAY_PLMN]: {
    700: { FDD: 9460 },
    800: { FDD: 6275 },
    900: { FDD: 3476 },
    1800: { FDD: 1875 },
    2100: { FDD: 525 },
    2600: { FDD: 3350 },
  },
};

export function defaultLteEarfcn(plmn: string, bandMhz: number, duplex: "FDD" | "TDD"): number | null {
  return DEFAULT_LTE_EARFCNS[plmn]?.[bandMhz]?.[duplex] ?? null;
}
