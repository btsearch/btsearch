import type { CountryPack } from "../core/registry.ts";

export const gb: CountryPack = {
  countryCode: "GB",
  capabilities: {},
  conventions: {
    gnbidLength: () => 22,
  },
};
