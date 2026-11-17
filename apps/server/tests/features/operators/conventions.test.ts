import { describe, expect, it } from "vitest";

import { toOperatorConventions } from "../../../src/features/operators/conventions.js";
import type { LocatedOperatorRef } from "../../../src/features/operators/ref.js";

function operatorRef(countryCode: string, primaryPlmn: string | null, sharedNetworkPlmns: string[] = []): LocatedOperatorRef {
  return { id: 1, countryCode, primaryPlmn, sharedNetworkPlmns };
}

describe("toOperatorConventions", () => {
  it("treats an operator as a NetWorkS member through the primary PLMN of its shared network", () => {
    const member = toOperatorConventions(operatorRef("PL", "26002", ["26034"]));
    const alone = toOperatorConventions(operatorRef("PL", "26002"));

    expect(member.identifierKinds).toEqual(["networksId", "networksName", "operatorName"]);
    expect(member.lteSectorRule).toMatchObject({ clidStep: 1, maxSectors: 3 });
    expect(alone.identifierKinds).toEqual([]);
    expect(alone.lteSectorRule).toBeNull();
  });

  it("names each default channel's band by the channel itself, so FDD and TDD in one MHz range and downlink-only bands come out apart", () => {
    const conventions = toOperatorConventions(operatorRef("GB", "23415"));

    expect(conventions.gnbidLength).toBe(22);
    expect(conventions.lteSectorRule).toBeNull();
    expect(conventions.defaultEarfcns).toEqual(
      expect.arrayContaining([
        { bandCode: "B32", earfcn: 10220 },
        { bandCode: "B7", earfcn: 2850 },
        { bandCode: "B38", earfcn: 37900 },
      ]),
    );
  });

  it("gives an operator without a primary PLMN the country's defaults and no channels", () => {
    expect(toOperatorConventions(operatorRef("PL", null))).toEqual({
      gnbidLength: 24,
      nodeSpansSites: false,
      identifierKinds: [],
      lteSectorRule: null,
      defaultEarfcns: [],
    });
  });

  it("answers Verizon's 22-bit gNBID and its NR cells' sites of their own", () => {
    expect(toOperatorConventions(operatorRef("US", "311480"))).toMatchObject({ gnbidLength: 22, nodeSpansSites: true });
  });
});
