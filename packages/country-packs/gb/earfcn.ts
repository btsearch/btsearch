import type { DefaultEarfcn } from "../core/registry.ts";
import { EE_PLMN, O2_PLMN, THREE_PLMN, VODAFONE_PLMN } from "./operators.ts";

export const DEFAULT_EARFCN: DefaultEarfcn = {
  LTE: {
    [O2_PLMN]: {
      700: { FDD: 9260 },
      800: { FDD: 6400 },
      900: { FDD: 3725 },
      1800: { FDD: 1226 },
      2100: { FDD: 347 },
      2300: { TDD: 39250 },
      2600: { TDD: 38100 },
    },
    [VODAFONE_PLMN]: {
      700: { FDD: 9360 },
      800: { FDD: 6300 },
      900: { FDD: 3501 },
      1500: { FDD: 10220 },
      1800: { FDD: 1363 },
      2100: { FDD: 223 },
      2600: { FDD: 2850, TDD: 37900 },
    },
    [THREE_PLMN]: {
      700: { FDD: 9360 },
      800: { FDD: 6175 },
      1800: { FDD: 1363 },
      2100: { FDD: 76 },
    },
    [EE_PLMN]: {
      700: { FDD: 9460 },
      800: { FDD: 6225 },
      1800: { FDD: 1617 },
      2100: { FDD: 497 },
      2600: { FDD: 3350 },
    },
  },
};
