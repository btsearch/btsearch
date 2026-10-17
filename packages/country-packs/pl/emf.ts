import { ORANGE_PLMN, PLAY_PLMN, PLUS_PLMN, TMOBILE_PLMN } from "./operators.ts";

export const PLMN_TO_SI2PEM_NAME: Readonly<Record<string, string>> = {
  [PLUS_PLMN]: "Towerlink Poland Sp. z o.o.",
  [TMOBILE_PLMN]: "T-Mobile Polska S.A.",
  [ORANGE_PLMN]: "Orange Polska S.A.",
  [PLAY_PLMN]: "P4 Sp. z o.o.",
};

export const SI2PEM_NAME_TO_PLMN: Readonly<Record<string, string>> = {
  "Towerlink Poland Sp. z o.o.": PLUS_PLMN,
  "Polkomtel Sp. z o.o.": PLUS_PLMN,
  "T-Mobile Polska S.A.": TMOBILE_PLMN,
  "Orange Polska S.A.": ORANGE_PLMN,
  "P4 Sp. z o.o.": PLAY_PLMN,
};
