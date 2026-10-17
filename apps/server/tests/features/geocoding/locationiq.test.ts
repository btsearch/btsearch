import { describe, expect, it, vi } from "vitest";

import { createLocationIqProvider } from "../../../src/features/geocoding/locationiq.js";

const provider = createLocationIqProvider("unit-test-key");

function answer(body: unknown) {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
}

describe("createLocationIqProvider", () => {
  it.each([
    { name: "a Polish place", countryCode: "pl", region: "Łódzkie", municipality: "Zgierz" },
    { name: "a place in another country", countryCode: "fr", region: "województwo łódzkie", municipality: "gmina Zgierz" },
    { name: "a place without a country", countryCode: undefined, region: "województwo łódzkie", municipality: "gmina Zgierz" },
  ])("names the region and the municipality of $name by its country's conventions", async ({ countryCode, region, municipality }) => {
    const address = { country_code: countryCode, state: "województwo łódzkie", municipality: "gmina Zgierz" };
    vi.stubGlobal("fetch", answer([{ lat: "51.85", lon: "19.4", display_name: "Zgierz", address }]));

    const [place] = await provider.search("Zgierz", { language: "pl", countryCodes: [] });

    expect(place?.address).toMatchObject({ region, municipality, countryCode: countryCode ?? null });
  });

  it("names a Polish region result by its normalized name", async () => {
    const address = { country_code: "pl", state: "województwo łódzkie" };
    vi.stubGlobal("fetch", answer({ lat: "51.6", lon: "19.4", class: "boundary", display_place: "województwo łódzkie", address }));

    expect(await provider.reverse(51.6, 19.4, "pl")).toMatchObject({
      kind: "region",
      name: "Łódzkie",
      address: { region: "Łódzkie", municipality: null },
    });
  });
});
