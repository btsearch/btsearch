import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(post)/measurements/reading-blocks.js";
import { dbMock } from "../../../../helpers/boundaries.js";
import { readingBlockRow } from "../../../../helpers/measurementFixtures.js";
import { expectError, injectMutation, scriptAudit } from "../../../../helpers/mutationAssertions.js";
import { STAFF_ID, signInAs } from "../../../../helpers/officialFixtures.js";

const block = { phones: { modemFamily: "samsung" }, fields: ["pci", "channel"], mode: "corroborate", reason: "Samsung modems misreport" };

function create(payload: object) {
  return injectMutation(route, { method: "POST", url: "/measurements/reading-blocks", payload }, signInAs("admin"));
}

function inserted(table: string) {
  return dbMock.calls.find((call) => call.operation === "insert" && call.table === table)?.values;
}

describe("POST /measurements/reading-blocks", () => {
  it("adds a block, audits it, and folds the retained uploads again when asked", async () => {
    scriptAudit();
    dbMock.enqueueFor("insert", "reading_blocks", [readingBlockRow({ rats: ["LTE", "NR"] }).block]);
    dbMock.enqueueFor("select", "engine_runs", []);
    dbMock.enqueueFor("insert", "engine_runs", []);
    dbMock.enqueueFor("execute", undefined, []);
    dbMock.enqueueFor("select", "reading_blocks", [readingBlockRow({ rats: ["LTE", "NR"] })]);
    const response = await create({ ...block, technologies: ["lte", "nr"], refold: true });

    expect(response.statusCode).toBe(201);
    expect(response.json().data).toMatchObject({
      id: 2,
      phones: { modemFamily: "samsung" },
      technologies: ["lte", "nr"],
      createdBy: { id: STAFF_ID },
    });
    expect(inserted("reading_blocks")).toMatchObject({
      modemFamily: "samsung",
      rats: ["LTE", "NR"],
      roles: null,
      mode: "corroborate",
      createdById: STAFF_ID,
    });
    expect(inserted("engine_runs")).toEqual({ kind: "refold", params: { readingBlockId: 2 } });
    expect(inserted("audit_operations")).toMatchObject({ kind: "observations.reading_block_create" });
    expect(inserted("audit_logs")).toMatchObject([{ entity: "reading_blocks", op: "create" }]);
  });

  it("queues no refold unless asked", async () => {
    scriptAudit();
    dbMock.enqueueFor("insert", "reading_blocks", [readingBlockRow().block]);
    dbMock.enqueueFor("select", "reading_blocks", [readingBlockRow()]);
    const response = await create(block);

    expect(response.statusCode).toBe(201);
    expect(inserted("engine_runs")).toBeUndefined();
  });

  it("drops whole readings when no fields are named", async () => {
    const wholeReadings = readingBlockRow({ modemFamily: null, readerVersionId: 7, fields: null, mode: "drop" });
    scriptAudit();
    dbMock.enqueueFor("count", "reader_versions", 1);
    dbMock.enqueueFor("insert", "reading_blocks", [wholeReadings.block]);
    dbMock.enqueueFor("select", "reading_blocks", [wholeReadings]);
    const response = await create({ phones: { readerVersionId: 7 }, mode: "drop", reason: "Reports the PCI of the wrong cell" });

    expect(response.statusCode).toBe(201);
    expect(response.json().data).toMatchObject({ phones: { readerVersionId: 7 }, fields: null, mode: "drop" });
    expect(inserted("reading_blocks")).toMatchObject({ readerVersionId: 7, fields: null, mode: "drop" });
  });

  it.each([
    {
      name: "corroborate on timing advance",
      payload: { ...block, fields: ["timingAdvance"] },
      details: [{ field: "fields", validationMessage: "`corroborate` takes only `pci`, `channel`, `areaCode` and `bandwidth`" }],
    },
    {
      name: "whole readings held back for corroboration",
      payload: { phones: { modemFamily: "samsung" }, mode: "corroborate", reason: "Samsung modems misreport" },
      details: [{ field: "fields", validationMessage: "A block of whole readings takes `drop` and no `technologies` or `roles`" }],
    },
    {
      name: "an Android range that ends before it starts",
      payload: { ...block, sdkIntMin: 33, sdkIntMax: 31 },
      details: [{ field: "sdkIntMax", validationMessage: "Must not be below `sdkIntMin`" }],
    },
  ])("refuses $name", async ({ payload, details }) => {
    const response = await create(payload);
    expectError(response, 400, "VALIDATION_ERROR");
    expect(response.json().errors[0].details).toEqual(details);
  });

  it("refuses a SoC that does not exist", async () => {
    dbMock.enqueueFor("count", "socs", 0);
    const response = await create({ ...block, phones: { socId: 99 } });
    expectError(response, 400, "VALIDATION_ERROR");
    expect(response.json().errors[0].details).toEqual([{ field: "phones", validationMessage: "Nothing has this id" }]);
  });
});
