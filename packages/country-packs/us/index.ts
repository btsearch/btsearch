import { gnbidLengthByPlmn } from "../core/conventions.ts";
import type { CountryPack } from "../core/registry.ts";

const VERIZON_PLMN = "311480";

export const us: CountryPack = {
  countryCode: "US",
  mccs: ["310", "311", "312", "313", "314", "315", "316"],
  capabilities: {},
  conventions: {
    gnbidLength: gnbidLengthByPlmn({ [VERIZON_PLMN]: 22 }),
    nodeSpansSites: ({ primaryPlmn }) => primaryPlmn === VERIZON_PLMN,
  },
};
