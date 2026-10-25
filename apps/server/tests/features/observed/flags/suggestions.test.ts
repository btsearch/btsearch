import { cellApplyManySchema } from "@openbts/shared/contract";
import type { CellApplyNewCell } from "@openbts/shared/contract";
import { describe, expect, it } from "vitest";

import type { KnownPlmns } from "../../../../src/features/cells/networkWrites.js";
import { findMissingCells, raiseMissingCellFlags, siteStationKey } from "../../../../src/features/observed/flags/cells/cellMissing.js";
import { raiseNetworkFlags } from "../../../../src/features/observed/flags/cells/networks.js";
import { raiseValueFlags } from "../../../../src/features/observed/flags/cells/values.js";
import type { RaisedFlag } from "../../../../src/features/observed/flags/kinds.js";
import { raiseRenumberedFlag } from "../../../../src/features/observed/flags/sites/renumbered.js";
import { raiseSuggestedSiteFlag } from "../../../../src/features/observed/flags/sites/suggestedSite.js";
import { storedCellRows } from "../../../helpers/flagFixtures.js";
import { BIALYSTOK, siteRecord } from "../../../helpers/siteRecordFixtures.js";

type AppliedKind = "cellMissing" | "valueDiffers" | "valueMissing" | "networkMissing" | "networkNotSeen" | "suggestedSite" | "renumbered";

const STATION_ID = 40077;
const CELL_ID = 880345;
const PLUS = "26001";
const T_MOBILE = "26002";
const BOTH = 0b11n;
const B3 = { id: 3, value: 1800, rat: "LTE" as const, name: "LTE1800", duplex: "FDD" as const, variant: "commercial" as const, code: "B3" };
const known: KnownPlmns = new Map([
  [PLUS, { id: 1, code: PLUS, countryCode: "PL" }],
  [T_MOBILE, { id: 2, code: T_MOBILE, countryCode: "PL" }],
]);
const newCell: CellApplyNewCell = { rat: "lte", bandId: 3, tac: 51010, enbid: 24494, clid: 1, pci: 101, earfcn: 1850, plmns: [PLUS] };

function sighting(observedCellId: number) {
  return { observedCellId, observedSiteId: 9205, sampleCount: 20, contributorBits: BOTH, lastSeenOn: "2026-10-20" };
}

function valueFlags(): RaisedFlag<AppliedKind>[] {
  const lte = storedCellRows({ rat: "lte", bandId: 3, enbid: 123456, clid: 11, tac: null, pci: 214, earfcn: 1300 }, CELL_ID, STATION_ID);
  const seen = (field: "areaCode" | "pci", value: number) => ({ ...sighting(50411), cellId: CELL_ID, networkMatch: "own" as const, field, value });
  return raiseValueFlags({
    cells: [lte],
    values: [seen("pci", 301), seen("areaCode", 52010)],
    featuresByStation: new Map(),
    seenSince: "2026-10-01",
  }).raised;
}

function networkFlags(): RaisedFlag<AppliedKind>[] {
  const cell = { id: CELL_ID, stationId: STATION_ID, rat: "LTE", ownerCode: PLUS, extraCodes: ["26003"], countryCode: "PL" };
  const listed = (plmn: string, lastSeenOn: string) => ({
    ...sighting(50411),
    cellId: CELL_ID,
    ownPlmn: PLUS,
    networkMatch: "own" as const,
    plmn,
    lastSeenOn,
  });
  return raiseNetworkFlags({
    cells: [cell],
    observedCells: [],
    listedNetworks: [listed(PLUS, "2026-10-20"), listed(T_MOBILE, "2026-10-20"), listed("26003", "2026-06-01")],
    known,
    seenSince: "2026-07-27",
  });
}

function cellMissingFlags(): RaisedFlag<AppliedKind>[] {
  const siteCell = {
    id: 50411,
    plmn: PLUS,
    rat: "LTE" as const,
    cellKey: 123456 * 256 + 3,
    observedSiteId: 9205,
    stationId: STATION_ID,
    countryCode: "PL",
    isConfirmed: true,
    isCopy: false,
    matchedCellId: null,
    networkMatch: null,
    samples: 64,
    people: 3,
    lastSeenOn: "2026-10-20",
  };
  const value = (field: "areaCode" | "pci" | "channel", observed: number) => ({ ...sighting(50411), field, value: observed });
  return raiseMissingCellFlags({
    cells: findMissingCells([siteCell], new Set([siteStationKey(9205, STATION_ID)]), "2026-07-27"),
    values: [value("areaCode", 52010), value("pci", 214), value("channel", 1300)],
    listedNetworks: [],
    stations: new Map([[STATION_ID, { ownerCode: PLUS, countryCode: "PL", planBands: [B3] }]]),
    context: { known, gnbidLengths: new Map() },
  });
}

function siteFlags(): RaisedFlag<AppliedKind>[] {
  const station = { latitude: BIALYSTOK.latitude + 0.0045, longitude: BIALYSTOK.longitude };
  const suggested = raiseSuggestedSiteFlag(siteRecord({ status: "suggested", suggestedStationId: STATION_ID }), [newCell], station);
  const previous = siteRecord({ id: 6120, nodeId: 24400, status: "matched", matchedStationId: STATION_ID, lastSeenOn: "2026-10-01" });
  const renumbered = raiseRenumberedFlag(
    siteRecord({ id: 7310, nodeId: 24494, firstSeenOn: "2026-10-03" }),
    [{ observedCellId: 51001, cellKey: 24494 * 256 + 2, channel: 1850, pci: 101 }],
    [{ previous, stationId: STATION_ID, station: BIALYSTOK, cells: [{ cellId: CELL_ID, clid: 1, channel: 1850, pci: 101 }] }],
    { quietBefore: "2026-10-11" },
  );
  return [suggested, renumbered].flatMap((flag) => flag ?? []);
}

describe("the suggestions of the kinds POST /cells/apply applies", () => {
  const flags = [...valueFlags(), ...networkFlags(), ...cellMissingFlags(), ...siteFlags()];

  it("come from every such kind", () => {
    expect(new Set(flags.map((flag) => flag.kind))).toEqual(
      new Set(["valueDiffers", "valueMissing", "networkMissing", "networkNotSeen", "cellMissing", "suggestedSite", "renumbered"]),
    );
  });

  it.each(flags.map((flag) => [flag.kind, flag] as const))("are a POST /cells/apply body as they are, for %s", (_kind, flag) => {
    const body = [{ stationId: flag.refs.stationId, cells: flag.suggestion.cells, observationFlagIds: [4101] }];

    expect(cellApplyManySchema.safeParse(body).error?.issues).toBeUndefined();
  });
});
