import assert from "node:assert/strict";
import test from "node:test";

import { equivalentEnbids } from "../conventions/networks.ts";
import { FOREIGN_MEMBER, NETWORKS, ORANGE, PLAY, PLUS, TMOBILE, UNRELATED, WITHOUT_PLMN } from "./operators.ts";

const MEMBER_ENBIDS: [enbid: number, equivalent: number[]][] = [
  [0, [0]],
  [5, [5]],
  [9, [9]],
  [10, [10, 20, 30, 40, 50, 60, 70, 80, 90]],
  [57, [17, 27, 37, 47, 57, 67, 77, 87, 97]],
  [345, [145, 245, 345, 445, 545, 645, 745, 845, 945]],
  [1000, [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000]],
  [10234, [10234, 20234, 30234, 40234, 50234, 60234, 70234, 80234, 90234]],
  [100234, [100234, 200234, 300234, 400234, 500234, 600234, 700234, 800234, 900234]],
  [345678, [145678, 245678, 345678, 445678, 545678, 645678, 745678, 845678, 945678]],
  [999999, [199999, 299999, 399999, 499999, 599999, 699999, 799999, 899999, 999999]],
  [1048575, [1048575, 2048575, 3048575, 4048575, 5048575, 6048575, 7048575, 8048575, 9048575]],
];

const OTHER_OPERATORS = [PLUS, PLAY, NETWORKS, UNRELATED, FOREIGN_MEMBER, WITHOUT_PLMN];

void test("NetWorkS members match eNB ids that differ only in the first digit", () => {
  for (const [enbid, equivalent] of MEMBER_ENBIDS) {
    assert.deepEqual(equivalentEnbids(TMOBILE, enbid), equivalent);
    assert.deepEqual(equivalentEnbids(ORANGE, enbid), equivalent);
  }
});

void test("every other operator matches an eNB id only with itself", () => {
  for (const operator of OTHER_OPERATORS) {
    for (const [enbid] of MEMBER_ENBIDS) assert.deepEqual(equivalentEnbids(operator, enbid), [enbid], `operator ${operator.primaryPlmn}`);
  }
});
