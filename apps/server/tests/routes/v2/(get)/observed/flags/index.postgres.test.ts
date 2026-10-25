import { observationFlags } from "@openbts/drizzle";
import { createInsertSchema } from "drizzle-orm/zod";
import { expect, it, vi } from "vitest";
import type { z } from "zod/v4";

import getObservationFlag from "../../../../../../src/routes/v2/(get)/observed/flags/[id].js";
import getObservationFlags from "../../../../../../src/routes/v2/(get)/observed/flags/index.js";
import type { DbTx } from "../../../../../../src/types/global.js";
import { userSession } from "../../../../../helpers/boundaries.js";
import { describeOnCrowdDatabase, rolledBack } from "../../../../../helpers/crowdDatabase.js";
import {
  addCountry,
  addGrant,
  addLteBand,
  addLteCell,
  addObservedSite,
  addOperator,
  addRegion,
  addStation,
  addUser,
  added,
} from "../../../../../helpers/crowdWorld.js";
import { bandFlagRow, pciFlagRow } from "../../../../../helpers/flagFixtures.js";
import { injectMutation } from "../../../../../helpers/mutationAssertions.js";

vi.mock("../../../../../../src/database/psql.js", async () => (await import("../../../../../helpers/crowdDatabase.js")).databaseOfOpenTransaction());

const COUNTRY_CODE = "QR";
const PLMN = "99984";
const OTHER_PLMN = "99983";

const flagInsertSchema = createInsertSchema(observationFlags);

type Flags = Awaited<ReturnType<typeof addFlags>>;

async function addFlag(tx: DbTx, flag: z.infer<typeof flagInsertSchema>): Promise<number> {
  return added(await tx.insert(observationFlags).values(flag).returning({ id: observationFlags.id }), "The flag").id;
}

async function addFlags(tx: DbTx) {
  await addCountry(tx, COUNTRY_CODE);
  const operatorId = await addOperator(tx, COUNTRY_CODE, Number(PLMN));
  const [editedRegion, otherRegion] = [await addRegion(tx, COUNTRY_CODE), await addRegion(tx, COUNTRY_CODE)];
  const inRegion = await addStation(tx, { operatorId, regionId: editedRegion, at: [-40.4, 35.3] });
  const elsewhere = await addStation(tx, { operatorId, regionId: otherRegion, at: [-40.5, 35.3] });
  const cellId = await addLteCell(tx, { stationId: inRegion, bandId: await addLteBand(tx), enbid: 1_040_200, clid: 1, pci: 214 });
  const observedSiteId = await addObservedSite(tx, PLMN, 1_040_201);
  const valueFlag = { kind: "valueDiffers" as const, evidence: pciFlagRow.evidence, suggestion: pciFlagRow.suggestion };

  return {
    operatorId,
    editedRegion,
    inRegion,
    cellId,
    observedSiteId,
    stationFlag: await addFlag(tx, { ...valueFlag, subjectKey: `cell:${cellId}:pci`, stationId: inRegion, cellId }),
    elsewhereFlag: await addFlag(tx, { ...valueFlag, subjectKey: `test:${elsewhere}:pci`, stationId: elsewhere }),
    siteFlag: await addFlag(tx, {
      kind: "positionShifts",
      subjectKey: `site:${observedSiteId}`,
      observedSiteId,
      countryCode: COUNTRY_CODE,
      regionId: editedRegion,
      evidence: { observedSiteIds: [observedSiteId], people: 3, shiftMeters: 450, radiusMeters: 200 },
      suggestion: null,
    }),
    bandFlag: await addFlag(tx, {
      kind: "bandNotInPlan",
      subjectKey: `country:${COUNTRY_CODE}:band:41`,
      countryCode: COUNTRY_CODE,
      evidence: bandFlagRow.evidence,
      suggestion: bandFlagRow.suggestion,
    }),
    readerFlag: await addFlag(tx, {
      kind: "readerQuirk",
      subjectKey: `test:${COUNTRY_CODE}:reader`,
      evidence: {
        field: "areaCode",
        pattern: "bytesSwapped",
        parameter: null,
        readerVersion: null,
        deviceModel: { id: 7, manufacturer: "Acme", model: "A1" },
        valueCount: 30,
        cellCount: 11,
        uploadCount: 4,
      },
      suggestion: { readingBlock: { phones: { deviceModelId: 7 }, fields: ["areaCode"], mode: "drop" } },
    }),
  };
}

async function staffSession(tx: DbTx, flags: Flags, role: "editor" | "maintainer" | "admin") {
  const userId = await addUser(tx, role === "admin" ? "admin" : "editor");
  if (role === "editor") await addGrant(tx, userId, { countryCode: COUNTRY_CODE, role, isCountryWide: false, regionIds: [flags.editedRegion] });
  if (role === "maintainer") await addGrant(tx, userId, { countryCode: COUNTRY_CODE, role, isCountryWide: true });
  return { session: userSession(userId, role === "admin" ? "admin" : "editor") };
}

async function listedIds(url: string, options: { session: ReturnType<typeof userSession> }): Promise<number[]> {
  const response = await injectMutation(getObservationFlags, { method: "GET", url }, options);
  expect(response.statusCode, response.body).toBe(200);
  return response
    .json()
    .data.map((flag: { id: number }) => flag.id)
    .toSorted((a: number, b: number) => a - b);
}

describeOnCrowdDatabase("GET /observed/flags", () => {
  it("gives an editor the flags of the stations and sites inside their grant, and none of the kinds kept for maintainers and administrators", () =>
    rolledBack(async (tx) => {
      const flags = await addFlags(tx);

      expect(await listedIds("/observed/flags", await staffSession(tx, flags, "editor"))).toEqual([flags.stationFlag, flags.siteFlag]);
    }));

  it("gives a maintainer every area flag of the country and its bandNotInPlan flags", () =>
    rolledBack(async (tx) => {
      const flags = await addFlags(tx);

      expect(await listedIds("/observed/flags", await staffSession(tx, flags, "maintainer"))).toEqual([
        flags.stationFlag,
        flags.elsewhereFlag,
        flags.siteFlag,
        flags.bandFlag,
      ]);
    }));

  it("gives an administrator every flag, the ones about readers too", () =>
    rolledBack(async (tx) => {
      const flags = await addFlags(tx);
      const admin = await staffSession(tx, flags, "admin");

      expect(await listedIds(`/observed/flags?countryCodes=${COUNTRY_CODE}`, admin)).toEqual([
        flags.stationFlag,
        flags.elsewhereFlag,
        flags.siteFlag,
        flags.bandFlag,
      ]);
      expect(await listedIds("/observed/flags?kinds=readerQuirk", admin)).toContain(flags.readerFlag);
    }));

  it("narrows the list to a station, a cell or an observed site", () =>
    rolledBack(async (tx) => {
      const flags = await addFlags(tx);
      const admin = await staffSession(tx, flags, "admin");

      expect(await listedIds(`/observed/flags?stationIds=${flags.inRegion}`, admin)).toEqual([flags.stationFlag]);
      expect(await listedIds(`/observed/flags?cellIds=${flags.cellId}`, admin)).toEqual([flags.stationFlag]);
      expect(await listedIds(`/observed/flags?observedSiteIds=${flags.observedSiteId}`, admin)).toEqual([flags.siteFlag]);
    }));

  it("narrows the list to the stations a text finds, here by a cell id", () =>
    rolledBack(async (tx) => {
      const flags = await addFlags(tx);
      const admin = await staffSession(tx, flags, "admin");

      expect(await listedIds("/observed/flags?station=1040200", admin)).toEqual([flags.stationFlag]);
    }));

  it("narrows the list to an operator's stations and to the sites observed under its networks", () =>
    rolledBack(async (tx) => {
      const flags = await addFlags(tx);
      const admin = await staffSession(tx, flags, "admin");
      const otherOperatorId = await addOperator(tx, COUNTRY_CODE, Number(OTHER_PLMN));
      const otherStation = await addStation(tx, { operatorId: otherOperatorId, regionId: flags.editedRegion, at: [-40.45, 35.3] });
      const otherFlag = await addFlag(tx, {
        kind: "valueDiffers",
        subjectKey: `test:${otherStation}:pci`,
        stationId: otherStation,
        evidence: pciFlagRow.evidence,
        suggestion: pciFlagRow.suggestion,
      });

      expect(await listedIds(`/observed/flags?operatorIds=${flags.operatorId}`, admin)).toEqual([
        flags.stationFlag,
        flags.elsewhereFlag,
        flags.siteFlag,
      ]);
      expect(await listedIds(`/observed/flags?operatorIds=${otherOperatorId}`, admin)).toEqual([otherFlag]);
    }));

  it("lists each station's flags together and the flags about no station last, and counts every kind and status", () =>
    rolledBack(async (tx) => {
      const flags = await addFlags(tx);
      const admin = await staffSession(tx, flags, "admin");
      const listed = await injectMutation(
        getObservationFlags,
        { method: "GET", url: `/observed/flags?countryCodes=${COUNTRY_CODE}&sort=stationId&includeCounts=true` },
        admin,
      );

      expect(listed.statusCode, listed.body).toBe(200);
      expect(listed.json().data.map((flag: { id: number }) => flag.id)).toEqual([
        flags.stationFlag,
        flags.elsewhereFlag,
        flags.bandFlag,
        flags.siteFlag,
      ]);
      expect(listed.json().counts).toEqual({ kinds: { valueDiffers: 2, positionShifts: 1, bandNotInPlan: 1 }, statuses: { open: 4 } });
    }));
});

describeOnCrowdDatabase("GET /observed/flags/:id", () => {
  it("answers an editor 404 for a flag outside their grant, as for one that does not exist", () =>
    rolledBack(async (tx) => {
      const flags = await addFlags(tx);
      const editor = await staffSession(tx, flags, "editor");

      const outside = await injectMutation(getObservationFlag, { method: "GET", url: `/observed/flags/${flags.elsewhereFlag}` }, editor);
      const inside = await injectMutation(getObservationFlag, { method: "GET", url: `/observed/flags/${flags.stationFlag}` }, editor);

      expect(outside.statusCode).toBe(404);
      expect(outside.json()).toMatchObject({ errors: [{ code: "NOT_FOUND" }] });
      expect(inside.statusCode, inside.body).toBe(200);
      expect(inside.json()).toMatchObject({ data: { id: flags.stationFlag, kind: "valueDiffers", stationId: flags.inRegion } });
    }));
});
