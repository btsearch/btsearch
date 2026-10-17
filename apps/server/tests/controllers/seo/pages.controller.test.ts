import Fastify from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { describe, expect, it, vi } from "vitest";

import { siteName } from "../../../src/config.js";
import { SEOPagesController } from "../../../src/controllers/seo/pages.controller.js";
import { getRuntimeSettings } from "../../../src/lib/runtimeSettings.js";
import { cacheInRedis, dbMock } from "../../helpers/boundaries.js";
import { COUNTRY_VISIBILITY_KEY, SOURCE_VISIBILITY_KEY } from "../../helpers/officialDataFixtures.js";

const shell = "<!doctype html><html><head><title>App</title></head><body></body></html>";
const listRow = {
  id: 1,
  uuid: "k3VQ8xZr1PmT2a",
  name: "Trasa S7",
  description: null,
  is_public: true,
  notificationsEnabled: false,
  created_by: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  stations: { internal: [12, 13], official: [24] },
  radiolines: [36],
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

function station(id: number, networksId: number | null, countryCode: string | null) {
  return {
    id,
    stationCode: "12345",
    status: "published",
    extraAddress: null,
    operatorName: "Plus",
    countryCode,
    networksId,
    city: "Łódź",
    address: "ul. Długa 5",
    latitude: 51.77,
    longitude: 19.46,
    regionName: "Łódzkie",
  };
}

type CachedSource = { id: number; countryCode: string; shortName: string; isVisible: boolean; layers: string[] };

const POLISH_REGISTER = siteSource(1, "PL", "UKE");

const PERMIT_SOURCE_CASES = [
  {
    name: "names Poland's register as before",
    countryCode: "PL",
    sources: [POLISH_REGISTER],
    stationText: "azymuty, pozwolenia UKE i zdjęcia",
    locationText: "pasma i pozwolenia UKE",
  },
  {
    name: "names the one source of another country",
    countryCode: "DE",
    sources: [POLISH_REGISTER, siteSource(2, "DE", "BNetzA")],
    stationText: "azymuty, pozwolenia BNetzA i zdjęcia",
    locationText: "pasma i pozwolenia BNetzA",
  },
  {
    name: "names the sources once when they share one name",
    countryCode: "DE",
    sources: [siteSource(2, "DE", "BNetzA"), siteSource(3, "DE", "BNetzA")],
    stationText: "azymuty, pozwolenia BNetzA i zdjęcia",
    locationText: "pasma i pozwolenia BNetzA",
  },
  {
    name: "names no source when the sources have different names",
    countryCode: "DE",
    sources: [siteSource(2, "DE", "BNetzA"), siteSource(3, "DE", "RegTP")],
    stationText: "azymuty, pozwolenia i zdjęcia",
    locationText: "pasma i pozwolenia",
  },
  {
    name: "leaves the permits out when no public source publishes sites",
    countryCode: "DE",
    sources: [
      POLISH_REGISTER,
      { ...siteSource(2, "DE", "BNetzA"), isVisible: false },
      { ...siteSource(3, "DE", "RegTP"), layers: ["microwave_links"] },
    ],
    stationText: "azymuty i zdjęcia",
    locationText: "pasma",
  },
];

function siteSource(id: number, countryCode: string, shortName: string): CachedSource {
  return { id, countryCode, shortName, isVisible: true, layers: ["sites", "microwave_links"] };
}

function cacheVisibility(sources: readonly CachedSource[]) {
  cacheInRedis(COUNTRY_VISIBILITY_KEY, [
    { code: "PL", isVisible: true },
    { code: "DE", isVisible: true },
  ]);
  cacheInRedis(SOURCE_VISIBILITY_KEY, sources);
}

function descriptionTag(description: string) {
  return `<meta data-seo-inject name="description" content="${description}" />`;
}

async function requestPage(url: string) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(shell, { headers: { "content-type": "text/html; charset=utf-8" } })));
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  await app.register(SEOPagesController);
  const response = await app.inject({ url });
  await app.close();
  return response;
}

function stationPage(row: ReturnType<typeof station>, sources: readonly CachedSource[] = [POLISH_REGISTER]) {
  cacheVisibility(sources);
  dbMock.enqueueFor("select", "stations", [row]);
  dbMock.enqueueFor("select", "cells", [{ rat: "LTE", value: 1800 }]);
  return requestPage(`/stations/${row.id}`);
}

function locationPage(countryCode: string, sources: readonly CachedSource[]) {
  cacheVisibility(sources);
  dbMock.enqueueFor("select", "locations", [
    { id: 8, city: "Łódź", address: "ul. Długa 5", latitude: 51.77, longitude: 19.46, regionName: "Łódzkie", countryCode },
  ]);
  dbMock.enqueueFor("select", "stations", [{ id: 5, stationCode: "12345", operatorName: "Plus", status: "published" }]);
  return requestPage("/locations/8");
}

function listPage(row: typeof listRow) {
  getRuntimeSettings().enableUserLists = true;
  dbMock.query.userLists.findFirst.mockResolvedValue(row);
  return requestPage(`/lists/${row.uuid}`);
}

describe("SEOPagesController", () => {
  it.each([
    { name: "a Polish station's NetWorkS id behind N!", row: station(1, 54321, "PL"), stationName: "Stacja bazowa Plus 12345 (N!54321)" },
    { name: "another country's identifier as it is", row: station(2, 54321, "DE"), stationName: "Stacja bazowa Plus 12345 (54321)" },
    { name: "the identifier as it is when no country is known", row: station(3, 54321, null), stationName: "Stacja bazowa Plus 12345 (54321)" },
    { name: "no identifier for a station without one", row: station(4, null, "PL"), stationName: "Stacja bazowa Plus 12345" },
  ])("shows $name in the station's page head", async ({ row, stationName }) => {
    const response = await stationPage(row);

    expect(response.statusCode, response.body).toBe(200);
    expect(response.body).toContain(`<title data-seo-inject>${stationName} - Łódź | `);
    expect(response.body).toContain(`"name":"${stationName}"`);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it.each(PERMIT_SOURCE_CASES)("$name in a station's description", async ({ countryCode, sources, stationText }) => {
    const response = await stationPage(station(5, null, countryCode), sources);

    expect(response.statusCode, response.body).toBe(200);
    expect(response.body).toContain(
      descriptionTag(`Stacja bazowa Plus w Łódź, ul. Długa 5. Pasma: LTE 1800. Zobacz ${stationText} w bazie ${siteName}`),
    );
    expect(dbMock.pendingResults()).toBe(0);
  });

  it.each(PERMIT_SOURCE_CASES)("$name in a location's description", async ({ countryCode, sources, locationText }) => {
    const response = await locationPage(countryCode, sources);

    expect(response.statusCode, response.body).toBe(200);
    expect(response.body).toContain(
      descriptionTag(`Lokalizacja stacji bazowych: Łódź, ul. Długa 5 (woj. łódzkie). Stacje: Plus 12345. Zobacz ${locationText} w bazie ${siteName}`),
    );
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("names a public list, its owner and its operators in the page head", async () => {
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor("select", "users", [{ username: "antenowy" }]);
    dbMock.enqueueFor("select", "stations", [
      { id: 12, operatorId: 1 },
      { id: 13, operatorId: 2 },
    ]);
    dbMock.enqueueFor("select", "official.sources", [{ id: 1 }]);
    dbMock.enqueueFor("select", "official.sites", [{ id: 24, operatorId: 1 }]);
    dbMock.enqueueFor("select", "official.microwave_links", [{ id: 36 }]);
    dbMock.enqueueFor("select", "operators", [
      { id: 2, name: "Play", color: null, logoFile: null },
      { id: 1, name: "Orange", color: "#F59E0B", logoFile: null },
    ]);

    const response = await listPage(listRow);

    expect(response.statusCode, response.body).toBe(200);
    expect(response.body).toContain("<title data-seo-inject>Trasa S7 | ");
    expect(response.body).toContain(
      'content="Lista użytkownika @antenowy: 3 stacje (Orange: 2, Play: 1) i 1 radiolinia. Zobacz ją na mapie w bazie ',
    );
    expect(response.body).toContain("/public/og/lists/k3VQ8xZr1PmT2a.png");
    expect(response.body).toContain('<meta data-seo-inject name="robots" content="noindex" />');
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("serves a private list as the plain application page", async () => {
    const response = await listPage({ ...listRow, is_public: false });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.body).toContain("<title>App</title>");
    expect(response.body).toContain('<meta data-seo-inject name="robots" content="noindex" />');
    expect(response.body).not.toContain("Trasa S7");
    expect(dbMock.calls).toEqual([]);
  });
});
