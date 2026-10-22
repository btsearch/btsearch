import type { CountryPack } from "../core/registry.ts";

export const gb: CountryPack = {
  countryCode: "GB",
  mccs: ["234", "235"],
  capabilities: {},
  conventions: {
    gnbidLength: () => 22,
  },
};
