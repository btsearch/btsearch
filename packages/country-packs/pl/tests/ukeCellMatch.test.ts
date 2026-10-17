import assert from "node:assert/strict";
import test from "node:test";

import { decisionFragments } from "../sources/uke/cellMatch.ts";
import { FOREIGN_MEMBER, NETWORKS, ORANGE, PLAY, PLUS, TMOBILE, UNRELATED, WITHOUT_PLMN } from "./operators.ts";

const ENBIDS: [enbid: number, whole: string, withoutFirstDigit: string | null][] = [
  [0, "0", null],
  [5, "5", null],
  [9, "9", null],
  [10, "10", "0"],
  [57, "57", "7"],
  [100, "100", "0"],
  [345, "345", "45"],
  [1000, "1000", "0"],
  [10234, "10234", "234"],
  [100200, "100200", "200"],
  [345678, "345678", "45678"],
  [999999, "999999", "99999"],
  [1048575, "1048575", "48575"],
];

void test("Plus is looked up by the whole eNB id first, then without its first digit", () => {
  for (const [enbid, whole, withoutFirstDigit] of ENBIDS) {
    assert.deepEqual(decisionFragments(PLUS, enbid), withoutFirstDigit === null ? [whole] : [whole, withoutFirstDigit], whole);
  }
});

void test("T-Mobile and Orange are looked up without the first digit first, then by the whole eNB id", () => {
  for (const [enbid, whole, withoutFirstDigit] of ENBIDS) {
    const fragments = withoutFirstDigit === null ? [whole] : [withoutFirstDigit, whole];

    assert.deepEqual(decisionFragments(TMOBILE, enbid), fragments, whole);
    assert.deepEqual(decisionFragments(ORANGE, enbid), fragments, whole);
  }
});

void test("other operators have no eNB id in their decision numbers", () => {
  const sameNetworkElsewhere = { ...FOREIGN_MEMBER, sharedNetworkPlmns: ["26034"] };

  for (const operator of [PLAY, NETWORKS, UNRELATED, FOREIGN_MEMBER, WITHOUT_PLMN, sameNetworkElsewhere]) {
    for (const [enbid] of ENBIDS) assert.deepEqual(decisionFragments(operator, enbid), [], `${operator.primaryPlmn} ${enbid}`);
  }
});
