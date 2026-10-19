import { STATION_IDENTIFIER_KINDS, type StationIdentifierKind } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";

import { prepareStationChange } from "../../../src/features/stations/edit.js";
import { dbMock } from "../../helpers/boundaries.js";
import { operatorRow, primaryPlmn } from "../../helpers/operatorFixtures.js";
import { stationRow } from "../../helpers/stationFixtures.js";

type TestOperator = { id: number; countryCode: string; mnc: number | null; networkMnc?: number };

const NETWORK_ID = 5;
const VALUES: Record<StationIdentifierKind, string> = { networksId: "42", networksName: "Shared name", operatorName: "Own name" };
const ALL_IDENTIFIERS = { networks_id: 42, networks_name: "Shared name", mno_name: "Own name" };
const request = {} as FastifyRequest;

const newMember: TestOperator = { id: 9, countryCode: "PL", mnc: 26099, networkMnc: 26034 };
const plus: TestOperator = { id: 1, countryCode: "PL", mnc: 26001 };
const aero: TestOperator = { id: 17, countryCode: "PL", mnc: 26017 };
const foreign: TestOperator = { id: 40, countryCode: "DE", mnc: 26201 };
const foreignMember: TestOperator = { id: 41, countryCode: "DE", mnc: 26202, networkMnc: 26209 };
const unnumbered: TestOperator = { id: 50, countryCode: "PL", mnc: null };

function scriptOperator({ id, countryCode, mnc, networkMnc }: TestOperator): void {
  const links = networkMnc === undefined ? [] : [{ operatorId: id, kind: "jv_member", relatedOperatorId: NETWORK_ID }];
  const network = networkMnc === undefined ? [] : [operatorRow(NETWORK_ID, networkMnc, countryCode)];
  const networkPlmns = networkMnc === undefined ? [] : [primaryPlmn(NETWORK_ID, String(networkMnc))];
  dbMock.enqueueFor("select", "operators", [operatorRow(id, mnc, countryCode)], network);
  dbMock.enqueueFor("select", "plmns", mnc === null ? [] : [primaryPlmn(id, String(mnc))], networkPlmns);
  dbMock.enqueueFor("select", "operator_links", links);
}

function scriptStoredStation(operator: TestOperator): void {
  dbMock.query.stations.findFirst.mockResolvedValue({ ...stationRow({ operator_id: operator.id }), location: null, sectors: [] });
  dbMock.query.extraIdentificators.findFirst.mockResolvedValue(undefined);
  dbMock.query.stationBackhauls.findFirst.mockResolvedValue(undefined);
}

async function editIdentifiers(operator: TestOperator, kinds: readonly StationIdentifierKind[]) {
  scriptStoredStation(operator);
  dbMock.enqueueFor("select", "stations", [{ operatorId: operator.id }]);
  scriptOperator(operator);

  const identifiers = kinds.map((kind) => ({ kind, value: VALUES[kind] }));
  const { change } = await prepareStationChange(request, { action: "update", stationId: 1, station: { identifiers } });
  return change;
}

describe("prepareStationChange", () => {
  it("reads NetWorkS membership from the operator's shared network, not from its own network code", async () => {
    const change = await editIdentifiers(newMember, STATION_IDENTIFIER_KINDS);

    expect(change.station).toMatchObject(ALL_IDENTIFIERS);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("lets a station of Plus take the operator's own name", async () => {
    const change = await editIdentifiers(plus, ["operatorName"]);

    expect(change.station).toMatchObject({ mno_name: "Own name" });
  });

  it.each([
    { operator: plus, kinds: ["networksId"] },
    { operator: plus, kinds: ["networksName", "operatorName"] },
  ] as const)("refuses $kinds on a station of $operator.mnc, which takes only its own name", async ({ operator, kinds }) => {
    await expect(editIdentifiers(operator, kinds)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      statusCode: 400,
      message: "This operator's stations take only the operatorName identifier",
    });
  });

  it.each([
    { title: "another Polish operator", operator: aero },
    { title: "an operator in a country without a pack", operator: foreign },
    { title: "a shared network's member in a country without a pack", operator: foreignMember },
  ])("refuses every identifier on a station of $title", async ({ operator }) => {
    await expect(editIdentifiers(operator, STATION_IDENTIFIER_KINDS)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      statusCode: 400,
      message: "This operator's stations take no identifiers",
    });
  });

  it("does not check an operator without a network code", async () => {
    const change = await editIdentifiers(unnumbered, STATION_IDENTIFIER_KINDS);

    expect(change.station).toMatchObject(ALL_IDENTIFIERS);
  });

  it("checks the operator a new station names", async () => {
    dbMock.query.stations.findFirst.mockResolvedValue(undefined);
    dbMock.enqueueFor("select", "operators", [operatorRow(aero.id, aero.mnc, aero.countryCode)]);
    scriptOperator(aero);

    const station = { siteId: "A1", operatorId: aero.id, identifiers: [{ kind: "operatorName" as const, value: "Own name" }] };
    await expect(prepareStationChange(request, { action: "create", station })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "This operator's stations take no identifiers",
    });
    expect(dbMock.calls.some((call) => call.operation === "select" && call.table === "stations")).toBe(false);
  });

  it("leaves a change that only clears identifiers unchecked", async () => {
    scriptStoredStation(aero);

    const identifiers = [{ kind: "networksId" as const, value: null }];
    await prepareStationChange(request, { action: "update", stationId: 1, station: { identifiers } });

    expect(dbMock.calls.some((call) => call.table === "operators")).toBe(false);
  });
});
