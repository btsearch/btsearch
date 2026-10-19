import { describe, expect, it } from "vitest";

import { cellNetworkKeys } from "../../../src/features/cells/networkWrites.js";
import { validateCellDuplicates } from "../../../src/features/submissions/helpers.js";

const lte = { rat: "LTE", details: { enbid: 12345, clid: 1 } };

describe("validateCellDuplicates", () => {
  it("refuses one identity twice on the station owner's network", () => {
    expect(() => validateCellDuplicates([lte, lte])).toThrow("Duplicate eNBID+CLID (12345+1) found in LTE cells");
  });

  it("allows one identity twice when the two cells share no network", () => {
    expect(() => validateCellDuplicates([lte, lte], [["26002"], ["26003"]])).not.toThrow();
  });

  it("refuses one identity twice when the cells share an extra network", () => {
    expect(() =>
      validateCellDuplicates(
        [lte, lte],
        [
          ["26002", "26034"],
          ["26003", "26034"],
        ],
      ),
    ).toThrow("eNBID+CLID");
  });

  it("keys an NR cell by its NCI, whatever the gNB ID split", () => {
    const short = { rat: "NR", details: { gnbid: 400, clid: 2, gnbid_length: 24 } };
    const long = { rat: "NR", details: { gnbid: 6400, clid: 2, gnbid_length: 28 } };

    expect(() => validateCellDuplicates([short, long])).toThrow("Duplicate NCI (1638402) found in NR cells");
  });

  it("ignores deleted cells and unknown identities", () => {
    const unknown = { rat: "LTE", details: { enbid: 0, clid: 0 } };

    expect(() => validateCellDuplicates([unknown, unknown, { ...lte, operation: "delete" }, lte])).not.toThrow();
  });
});

describe("cellNetworkKeys", () => {
  it("puts the owner's main code first, then the cell's extra codes", () => {
    expect(cellNetworkKeys({ operatorId: 7, mainCode: "26002", countryCode: "PL" }, ["26034"])).toEqual(["26002", "26034"]);
  });

  it("stands in the operator for a main code the owner does not have", () => {
    expect(cellNetworkKeys({ operatorId: 7, mainCode: null, countryCode: "PL" }, [])).toEqual(["operator:7"]);
  });
});
