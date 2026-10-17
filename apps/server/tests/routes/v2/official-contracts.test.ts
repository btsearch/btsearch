import { describe, expect, it } from "vitest";

import { findDocumentationGap } from "../../../src/features/openapi/document.js";
import { TAG_GROUPS } from "../../../src/features/openapi/tags.js";
import getImportRun from "../../../src/routes/v2/(get)/official/import-runs/[id].js";
import getImportRuns from "../../../src/routes/v2/(get)/official/import-runs/index.js";
import getLicensee from "../../../src/routes/v2/(get)/official/licensees/[id].js";
import getLicensees from "../../../src/routes/v2/(get)/official/licensees/index.js";
import getMicrowaveLink from "../../../src/routes/v2/(get)/official/microwave-links/[id].js";
import getMicrowaveLinks from "../../../src/routes/v2/(get)/official/microwave-links/index.js";
import getOfficialSources from "../../../src/routes/v2/(get)/official/sources/index.js";
import updateOfficialDataset from "../../../src/routes/v2/(patch)/official/datasets/[id].js";
import updateLicensee from "../../../src/routes/v2/(patch)/official/licensees/[id].js";
import updateOfficialSource from "../../../src/routes/v2/(patch)/official/sources/[key].js";
import cancelImportRun from "../../../src/routes/v2/(post)/official/import-runs/[id]/cancel.js";
import startImportRun from "../../../src/routes/v2/(post)/official/import-runs/index.js";

const adminReads = [getImportRuns, getImportRun];
const microwaveLinkReads = [getLicensees, getLicensee, getMicrowaveLinks, getMicrowaveLink];
const reads = [getOfficialSources, ...adminReads, ...microwaveLinkReads];
const writes = [updateOfficialSource, updateOfficialDataset, startImportRun, cancelImportRun, updateLicensee];

describe("v2 official routes", () => {
  it.each([...reads, ...writes])("$method $url can be documented, in a category that has a description and a group", (route) => {
    expect(findDocumentationGap(route as unknown as Parameters<typeof findDocumentationGap>[0])).toBeUndefined();
    expect(route.url.startsWith("/official/")).toBe(true);
    expect(TAG_GROUPS.filter((group) => group.tags.includes("official")).map((group) => group.name)).toEqual(["Official sources and tools"]);
  });

  it.each(adminReads)("$method $url needs the permission to read imports", (route) => {
    expect(route.config).toMatchObject({ permissions: ["read:official_import"] });
    expect(route.config).not.toHaveProperty("allowGuestAccess");
  });

  it.each(microwaveLinkReads)("$method $url is open to guests with the permission to read microwave links", (route) => {
    expect(route.config).toMatchObject({ permissions: ["read:microwave_links"], allowGuestAccess: true });
  });

  it("lets anyone read the sources", () => {
    expect(getOfficialSources.config).toEqual({ allowGuestAccess: true });
  });

  it.each(writes)("$method $url needs the permission to run imports", (route) => {
    expect(route.config).toMatchObject({ permissions: ["run:official_import"] });
    expect(route.config).not.toHaveProperty("allowGuestAccess");
  });

  it("never declares an error status in a response schema", () => {
    for (const route of [...reads, ...writes]) {
      const statuses = Object.keys((route.schema?.response ?? {}) as Record<string, unknown>).map(Number);
      expect(statuses.every((status) => status >= 200 && status < 300)).toBe(true);
    }
  });
});
