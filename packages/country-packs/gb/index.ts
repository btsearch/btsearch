import type { CountryPack } from "../core/registry.ts";
import { DEFAULT_EARFCN } from "./earfcn.ts";

export const gb: CountryPack = {
  countryCode: "GB",
  mccs: ["234", "235"],
  capabilities: {},
  conventions: {
    gnbidLength: () => 22,
  },
  defaultEarfcn: DEFAULT_EARFCN,
};
