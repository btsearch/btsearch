import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import route from "../../../src/routes/v2/(post)/cells/match.js";
import { dbMock } from "../../helpers/boundaries.js";
import { operatorRow, primaryPlmn } from "../../helpers/operatorFixtures.js";
import { createRouteHarness } from "../../helpers/routeHarness.js";

vi.mock("@openbts/country-packs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@openbts/country-packs")>();
  return {
    ...actual,
    conventionsFor: (countryCode: string | null) => {
      const conventions = actual.conventionsFor(countryCode);
      return countryCode === "DE" ? { ...conventions, gnbidLength: () => 28 } : conventions;
    },
  };
});

const dialect = new PgDialect();

function network(code: string, countryCode: string) {
  dbMock.enqueueFor("select", "countries", []);
  dbMock.enqueueFor("select", "plmns", [{ code, operatorId: 1, countryCode }]);
  dbMock.enqueueFor("select", "operator_links", []);
  dbMock.enqueueFor("select", "operators", [operatorRow(1, null, countryCode)], []);
  dbMock.enqueueFor("select", "plmns", [primaryPlmn(1, code)], []);
  dbMock.enqueueFor("select", "operator_links", []);
}

async function matchNci(code: string, countryCode: string) {
  network(code, countryCode);
  dbMock.enqueueFor("select", "cells", [], []);
  const app = await createRouteHarness(route);
  const response = await app.inject({ method: "POST", url: "/cells/match", payload: { cells: [{ rat: "nr", plmn: code, nci: 819202 }] } });
  expect(response.statusCode, response.body).toBe(200);
  return dbMock.calls
    .filter((call) => call.operation === "select" && call.table === "cells")
    .map((call) => dialect.sqlToQuery(call.clauses.where?.[0] as never).params);
}

describe("NCI split in the analyzer", () => {
  it("splits an NCI by the operator's gNB ID length", async () => {
    const lookups = await matchNci("26201", "DE");

    expect(lookups.some((params) => params.includes(3200))).toBe(true);
    expect(lookups.some((params) => params.includes(200))).toBe(false);
  });

  it("splits a British NCI at 22 bits, as every operator in Great Britain does", async () => {
    const lookups = await matchNci("23415", "GB");

    expect(lookups.some((params) => params.includes(50))).toBe(true);
    expect(lookups.some((params) => params.includes(200))).toBe(false);
  });

  it("splits an NCI at 24 bits for an operator whose pack does not say otherwise", async () => {
    const lookups = await matchNci("26001", "PL");

    expect(lookups.some((params) => params.includes(200))).toBe(true);
    expect(lookups.some((params) => params.includes(3200))).toBe(false);
  });
});
