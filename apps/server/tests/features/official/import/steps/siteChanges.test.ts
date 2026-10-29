import { describe, expect, it } from "vitest";

import { summarizeSiteChanges } from "../../../../../src/features/official/import/steps/siteChanges.js";
import { change } from "../../../../helpers/importEngineFixtures.js";

describe("the changes of a run, per official site", () => {
  it("counts the permits added and archived and remembers that the site itself was added", () => {
    const summaries = summarizeSiteChanges([
      change(3, "site_added", { officialSiteId: 503 }),
      change(4, "permit_added", { officialSiteId: 503, permitId: 703 }),
      change(1, "permit_added", { officialSiteId: 501, permitId: 701 }),
      change(2, "permit_added", { officialSiteId: 501, permitId: 702 }),
      change(8, "permit_archived", { officialSiteId: 501, permitId: 650 }),
      change(9, "permit_archived", { officialSiteId: 502, permitId: 651 }),
    ]);

    expect(summaries).toEqual([
      { officialSiteId: 503, lastSeq: 4, wasAdded: true, permitsAdded: 1, permitsArchived: 0 },
      { officialSiteId: 501, lastSeq: 8, wasAdded: false, permitsAdded: 2, permitsArchived: 1 },
      { officialSiteId: 502, lastSeq: 9, wasAdded: false, permitsAdded: 0, permitsArchived: 1 },
    ]);
  });

  it("counts neither as added nor as archived a permit that the same run added and archived again", () => {
    const [site] = summarizeSiteChanges([
      change(1, "permit_added", { officialSiteId: 501, permitId: 701 }),
      change(3, "permit_archived", { officialSiteId: 501, permitId: 650 }),
      change(5, "permit_archived", { officialSiteId: 501, permitId: 701 }),
    ]);

    expect(site).toMatchObject({ permitsAdded: 0, permitsArchived: 1 });
  });

  it("counts a permit a remap moved in as added, and one it moved out or merged away as archived", () => {
    const summaries = summarizeSiteChanges([
      change(3, "site_added", { officialSiteId: 903 }),
      change(5, "permit_moved_out", { officialSiteId: 502, permitId: 703 }),
      change(6, "permit_moved_in", { officialSiteId: 602, permitId: 703 }),
      change(7, "permit_moved_out", { officialSiteId: 503, permitId: 704 }),
      change(8, "permit_moved_in", { officialSiteId: 903, permitId: 704 }),
      change(9, "permit_moved_out", { officialSiteId: 502, permitId: 702 }),
    ]);

    expect(summaries).toEqual([
      { officialSiteId: 602, lastSeq: 6, wasAdded: false, permitsAdded: 1, permitsArchived: 0 },
      { officialSiteId: 503, lastSeq: 7, wasAdded: false, permitsAdded: 0, permitsArchived: 1 },
      { officialSiteId: 903, lastSeq: 8, wasAdded: true, permitsAdded: 1, permitsArchived: 0 },
      { officialSiteId: 502, lastSeq: 9, wasAdded: false, permitsAdded: 0, permitsArchived: 2 },
    ]);
  });
});
