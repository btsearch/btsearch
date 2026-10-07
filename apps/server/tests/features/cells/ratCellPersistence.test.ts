import type { CountryFeatures } from "@openbts/shared/contract";
import { describe, expect, it } from "vitest";

import { insertRATCellDetailsReturning, updateRATCellDetailsReturning } from "../../../src/features/cells/ratCellPersistence.js";
import type { DbTx } from "../../../src/types/global.js";
import { dbMock } from "../../helpers/boundaries.js";

const tx = dbMock as unknown as DbTx;
const pscCountry: CountryFeatures = { structureOwnerProposals: true, psc: true, bsic: false };
const bsicCountry: CountryFeatures = { structureOwnerProposals: false, psc: false, bsic: true };

describe("updateRATCellDetailsReturning", () => {
  it("preserves stored PSC when its country disables collection", async () => {
    dbMock.enqueueFor("update", "umts_cells", [{ cell_id: 1, psc: 73 }]);

    const result = await updateRATCellDetailsReturning(tx, "UMTS", 1, { psc: null, arfcn: 10564 }, bsicCountry);

    expect(result).toMatchObject({ psc: 73 });
    expect(dbMock.calls.find((call) => call.operation === "update")?.values).toMatchObject({ psc: undefined, arfcn: 10564 });
  });

  it("preserves stored BSIC independently of enabled PSC", async () => {
    dbMock.enqueueFor("update", "gsm_cells", [{ cell_id: 1, bsic: 26 }]);

    const result = await updateRATCellDetailsReturning(tx, "GSM", 1, { bsic: 19, lac: 100 }, pscCountry);

    expect(result).toMatchObject({ bsic: 26 });
    expect(dbMock.calls.find((call) => call.operation === "update")?.values).toMatchObject({ bsic: undefined, lac: 100 });
  });

  it("allows clearing PSC when its country enables collection", async () => {
    dbMock.enqueueFor("update", "umts_cells", [{ cell_id: 1, psc: null }]);

    await updateRATCellDetailsReturning(tx, "UMTS", 1, { psc: null }, pscCountry);

    expect(dbMock.calls.find((call) => call.operation === "update")?.values).toMatchObject({ psc: null });
  });

  it("returns null when the cell details no longer exist", async () => {
    dbMock.enqueueFor("update", "gsm_cells", []);

    expect(await updateRATCellDetailsReturning(tx, "GSM", 1, { bsic: 0 }, bsicCountry)).toBeNull();
  });

  it("propagates a failed write", async () => {
    dbMock.enqueueFor("update", "gsm_cells", new Error("Write failed"));

    await expect(updateRATCellDetailsReturning(tx, "GSM", 1, { bsic: 0 }, bsicCountry)).rejects.toThrow("Write failed");
  });
});

describe("insertRATCellDetailsReturning", () => {
  it("saves BSIC when enabled even though PSC is disabled", async () => {
    dbMock.enqueueFor("insert", "gsm_cells", [{ cell_id: 1, bsic: 0 }]);

    await insertRATCellDetailsReturning(tx, "GSM", 1, { lac: 100, cid: 1, e_gsm: false, bsic: 0 }, bsicCountry);

    expect(dbMock.calls.find((call) => call.operation === "insert")?.values).toMatchObject({ bsic: 0 });
  });

  it("omits BSIC when the station country disables it", async () => {
    dbMock.enqueueFor("insert", "gsm_cells", [{ cell_id: 1, bsic: null }]);

    await insertRATCellDetailsReturning(tx, "GSM", 1, { lac: 100, cid: 1, e_gsm: false, bsic: 26 }, pscCountry);

    expect(dbMock.calls.find((call) => call.operation === "insert")?.values).toMatchObject({ bsic: undefined });
  });

  it("saves PSC when enabled even though BSIC is disabled", async () => {
    dbMock.enqueueFor("insert", "umts_cells", [{ cell_id: 1, psc: 0 }]);

    await insertRATCellDetailsReturning(tx, "UMTS", 1, { lac: 100, rnc: 1, cid: 1, arfcn: 10564, psc: 0 }, pscCountry);

    expect(dbMock.calls.find((call) => call.operation === "insert")?.values).toMatchObject({ psc: 0 });
  });
});
