import type { Licensee } from "@openbts/shared/contract";
import { describe, expect, it } from "vitest";

import {
  type SourceMicrowaveLinkHistory,
  filterMicrowaveLinkHistories,
  loadMicrowaveLinkBreakdowns,
  loadMicrowaveLinkHistories,
} from "../../../../src/features/stats/microwaveLinks/read.js";
import { dbMock, redisMock } from "../../../helpers/boundaries.js";

const ORANGE: Licensee = { id: 12, sourceKey: "pl-uke", name: "Orange Polska", legalName: "Orange Polska S.A.", operatorId: 3, brandId: null };
const PLAY: Licensee = { id: 13, sourceKey: "pl-uke", name: "P4", legalName: "P4 Sp. z o.o.", operatorId: 4, brandId: null };
const PUBLIC_SOURCE = { sourceIds: [1], hiddenCountryCodes: [] };
const ORANGE_ROW = {
  licensee: { id: 12, name: "Orange Polska", full_name: "Orange Polska S.A.", operatorId: 3, brandId: null, sourceId: 1 },
  sourceKey: "pl-uke",
};

function header(id: number, startsOn: string, specsDate: string | null) {
  return {
    id,
    sourceId: 1,
    sourceKey: "pl-uke",
    countryCode: "PL",
    attribution: "Source: UKE",
    startsOn,
    takenAt: new Date(`${startsOn.slice(0, 8)}25T09:30:00.000Z`),
    specsDate: specsDate === null ? null : new Date(specsDate),
  };
}

function countRow(snapshotId: number, dimension: string, bucket: string | null, licenseeId: number | null = ORANGE.id) {
  return { snapshotId, licenseeId, dimension, bucket, links: 1, totalLengthMeters: 1000 };
}

function point(startsOn: string, licenseeId: number) {
  return { startsOn, licenseeId, links: 10, totalLengthMeters: 25_000 };
}

describe("the microwave link breakdown", () => {
  it("reads the newest snapshot of each source with its own dates, rows sorted by dimension and bucket, vendors by name and null last", async () => {
    dbMock.enqueueFor("select", "microwave_link_snapshots", [header(1, "2026-04-01", "2026-04-27"), header(2, "2026-10-01", "2026-07-27")]);
    dbMock.enqueueFor("select", "microwave_link_snapshot_counts", [
      countRow(2, "vendor", null),
      countRow(2, "vendor", "Nokia"),
      countRow(2, "vendor", "Ericsson"),
      countRow(2, "type", "other"),
      countRow(2, "type", "XPIC"),
      countRow(2, "band", "other"),
      countRow(2, "band", "70/80"),
      countRow(2, "band", "8", null),
      countRow(2, "band", "8"),
      countRow(2, "total", null),
      countRow(2, "capacity", null),
      countRow(2, "capacity", ">=10000"),
      countRow(2, "capacity", "<512"),
    ]);
    dbMock.enqueueFor("select", "official.licensees", [ORANGE_ROW]);

    const [breakdown, ...others] = await loadMicrowaveLinkBreakdowns();

    expect(others).toEqual([]);
    expect(breakdown).toMatchObject({
      startsOn: "2026-10-01",
      takenAt: "2026-10-25T09:30:00.000Z",
      specsAsOf: "2026-07-27T00:00:00.000Z",
      licensees: [ORANGE],
    });
    expect(breakdown?.rows.map(({ dimension, bucket, licenseeId }) => [dimension, bucket, licenseeId])).toEqual([
      ["total", null, 12],
      ["band", "8", 12],
      ["band", "8", null],
      ["band", "70/80", 12],
      ["band", "other", 12],
      ["type", "XPIC", 12],
      ["type", "other", 12],
      ["capacity", "<512", 12],
      ["capacity", ">=10000", 12],
      ["capacity", null, 12],
      ["vendor", "Ericsson", 12],
      ["vendor", "Nokia", 12],
      ["vendor", null, 12],
    ]);
  });

  it("reads the snapshot of the month asked for, also when it counted no links", async () => {
    dbMock.enqueueFor("select", "microwave_link_snapshots", [header(1, "2026-04-01", "2026-04-27"), header(2, "2026-10-01", "2026-07-27")]);
    dbMock.enqueueFor("select", "microwave_link_snapshot_counts", []);

    expect(await loadMicrowaveLinkBreakdowns("2026-04-01")).toEqual([
      expect.objectContaining({ startsOn: "2026-04-01", specsAsOf: "2026-04-27T00:00:00.000Z", licensees: [], rows: [] }),
    ]);
  });

  it("answers a month without a snapshot with nothing, without reading counts or caching that month", async () => {
    dbMock.enqueueFor("select", "microwave_link_snapshots", [header(2, "2026-10-01", "2026-07-27")]);

    expect(await loadMicrowaveLinkBreakdowns("2026-05-01")).toEqual([]);
    expect(dbMock.calls.some((call) => call.table === "microwave_link_snapshot_counts")).toBe(false);
    expect(redisMock.setEx.mock.calls.map(([key]) => key)).toEqual(["statistics:v2:microwave-links:snapshots"]);
  });
});

describe("the microwave link history", () => {
  it("lists every month with a snapshot, also one in which nobody held links", async () => {
    dbMock.enqueueFor("select", "microwave_link_snapshots", [header(1, "2026-07-01", "2026-07-27"), header(2, "2026-08-01", "2026-07-27")]);
    dbMock.enqueueFor("select", "microwave_link_snapshot_counts", [{ snapshotId: 1, licenseeId: 12, links: 10, totalLengthMeters: 25_000 }]);
    dbMock.enqueueFor("select", "official.licensees", [ORANGE_ROW]);

    expect(await loadMicrowaveLinkHistories()).toEqual([
      {
        sourceId: 1,
        sourceKey: "pl-uke",
        countryCode: "PL",
        licensees: [ORANGE],
        months: ["2026-07-01", "2026-08-01"],
        points: [point("2026-07-01", 12)],
      },
    ]);
  });

  const history: SourceMicrowaveLinkHistory = {
    sourceId: 1,
    sourceKey: "pl-uke",
    countryCode: "PL",
    licensees: [ORANGE, PLAY],
    months: ["2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01"],
    points: [point("2026-06-01", 12), point("2026-06-01", 13), point("2026-07-01", 12), point("2026-08-01", 12), point("2026-09-01", 12)],
  };

  it("keeps the months that end on or after takenAfter and start on or before takenBefore, with only the licensees they name", () => {
    expect(filterMicrowaveLinkHistories([history], ["PL"], PUBLIC_SOURCE, { takenAfter: "2026-07-15", takenBefore: "2026-08-01" })).toEqual([
      {
        sourceKey: "pl-uke",
        countryCode: "PL",
        licensees: [ORANGE],
        months: ["2026-07-01", "2026-08-01"],
        points: [point("2026-07-01", 12), point("2026-08-01", 12)],
      },
    ]);
  });

  it("leaves out a source the caller cannot see and a country that was not asked for", () => {
    expect(filterMicrowaveLinkHistories([history], ["PL"], { sourceIds: [2], hiddenCountryCodes: [] }, {})).toEqual([]);
    expect(filterMicrowaveLinkHistories([history], ["GB"], PUBLIC_SOURCE, {})).toEqual([]);
  });
});
