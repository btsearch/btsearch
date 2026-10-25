import { describe, expect, it } from "vitest";

import { type LengthTest, raiseGnbLengthFlags } from "../../../../src/features/observed/flags/gnbLength.js";

const PLAY = "26006";
const COUNTRIES = new Map([[PLAY, "PL"]]);

function tests(cutAt: number, scoreOf: (length: number) => { together: number; apart: number }): LengthTest[] {
  return Array.from({ length: 11 }, (_, index) => {
    const length = 22 + index;
    return { plmn: PLAY, length, isCutLength: length === cutAt, ...scoreOf(length), sites: 2000 - 40 * index };
  });
}

describe("gnbLengthSuggestion", () => {
  it("suggests 28 bits for a network whose cells stand together at 28 and apart at 24, cut at 24", () => {
    const network = tests(24, (length) => (length >= 28 ? { together: 120, apart: 0 } : { together: 10, apart: 90 }));

    expect(raiseGnbLengthFlags(network, COUNTRIES)).toEqual({
      raised: [
        {
          kind: "gnbLengthSuggestion",
          subjectKey: `plmn:${PLAY}`,
          refs: { countryCode: "PL" },
          evidence: { plmn: PLAY, length: 24, suggestedLength: 28, siteCount: 1920 },
          suggestion: null,
          measure: { length: 24, suggestedLength: 28 },
        },
      ],
      fixed: [],
    });
  });

  it("suggests the shortest length of the plateau, 24, for a network cut at 26 that scores the same from 24 to 32", () => {
    const network = tests(26, (length) => (length >= 24 ? { together: 80, apart: 0 } : { together: 30, apart: 40 }));

    expect(raiseGnbLengthFlags(network, COUNTRIES).raised[0]?.evidence).toMatchObject({ length: 26, suggestedLength: 24 });
  });

  it("raises nothing for a network of 12 cells", () => {
    const network = tests(24, (length) => (length >= 28 ? { together: 12, apart: 0 } : { together: 0, apart: 12 }));

    expect(raiseGnbLengthFlags(network, COUNTRIES)).toEqual({ raised: [], fixed: [] });
  });

  it("raises nothing when the cut length scores best, and counts an open flag of the network as fixed by the pack", () => {
    const network = tests(28, (length) => (length >= 28 ? { together: 120, apart: 0 } : { together: 10, apart: 90 }));

    expect(raiseGnbLengthFlags(network, COUNTRIES)).toEqual({ raised: [], fixed: [{ kind: "gnbLengthSuggestion", subjectKey: `plmn:${PLAY}` }] });
  });
});
