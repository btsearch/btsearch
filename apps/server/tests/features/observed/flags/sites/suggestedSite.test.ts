import type { CellApplyNewCell } from "@openbts/shared/contract";
import { describe, expect, it } from "vitest";

import { raiseSuggestedSiteFlag } from "../../../../../src/features/observed/flags/sites/suggestedSite.js";
import { BIALYSTOK, siteRecord } from "../../../../helpers/siteRecordFixtures.js";

const CONFIRMED_CELL: CellApplyNewCell = { rat: "lte", bandId: 3, tac: 51010, enbid: 24494, clid: 1, pci: 101, earfcn: 1850, plmns: ["26006"] };

describe("suggestedSite", () => {
  const suggested = siteRecord({ status: "suggested", suggestedStationId: 48870, isConfirmed: false });
  const station = { latitude: BIALYSTOK.latitude + 0.0045, longitude: BIALYSTOK.longitude };

  it("opens for a suggested site with how far its station stands, whether or not the site is confirmed", () => {
    const flag = raiseSuggestedSiteFlag(suggested, [CONFIRMED_CELL], station);

    expect(flag).toMatchObject({
      kind: "suggestedSite",
      refs: { observedSiteId: 7310, stationId: 48870 },
      evidence: { distanceMeters: 500, people: 4 },
    });
    expect(flag?.suggestion.cells).toEqual([{ action: "create", ...CONFIRMED_CELL }]);
  });

  it("does not open without a confirmed cell to add", () => {
    expect(raiseSuggestedSiteFlag(suggested, [], station)).toBeNull();
  });
});
