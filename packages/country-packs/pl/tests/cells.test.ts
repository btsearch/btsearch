import assert from "node:assert/strict";
import test from "node:test";

import { type OperatorRef, isLteSequenceStart } from "../../core/conventions.ts";
import { lteSectorRule } from "../conventions/cells.ts";
import { FOREIGN_MEMBER, NETWORKS, ORANGE, PLAY, PLUS, TMOBILE, UNRELATED, WITHOUT_PLMN } from "./operators.ts";

const RULES: [operator: OperatorRef, clidStep: number, maxSectors: number][] = [
  [PLAY, 10, 4],
  [PLUS, 1, 4],
  [TMOBILE, 1, 3],
  [ORANGE, 1, 3],
];

const SEQUENCE_STARTS: [ecid: number, isPlayStart: boolean, isConsecutiveStart: boolean][] = [
  [0, false, true],
  [3, false, true],
  [5, false, false],
  [9, false, true],
  [10, true, true],
  [14, true, false],
  [19, true, true],
  [20, false, true],
  [36, false, true],
  [40, true, true],
  [47, true, false],
  [69, false, true],
  [70, true, true],
  [79, true, true],
  [80, false, true],
  [100, false, true],
  [110, true, true],
  [141, true, false],
  [256, false, true],
  [3160320, false, true],
  [3160329, false, true],
  [3160331, false, false],
  [3160340, true, true],
  [3160345, true, false],
  [3160349, true, true],
  [268435455, false, false],
];

const CONSECUTIVE_OPERATORS = [PLUS, TMOBILE, ORANGE];
const WITHOUT_RULE = [NETWORKS, UNRELATED, FOREIGN_MEMBER, WITHOUT_PLMN];

function startsSequence(operator: OperatorRef, ecid: number): boolean | null {
  const rule = lteSectorRule(operator);
  return rule === null ? null : isLteSequenceStart(rule, ecid);
}

void test("gives Play, Plus and the NetWorkS members their LTE sector numbering", () => {
  for (const [operator, clidStep, maxSectors] of RULES) {
    const rule = lteSectorRule(operator);
    assert.equal(rule?.clidStep, clidStep, `operator ${operator.primaryPlmn}`);
    assert.equal(rule?.maxSectors, maxSectors, `operator ${operator.primaryPlmn}`);
  }
});

void test("starts Play's sequences by the tens digit of the ECID and the others' by its last digit", () => {
  for (const [ecid, isPlayStart, isConsecutiveStart] of SEQUENCE_STARTS) {
    assert.equal(startsSequence(PLAY, ecid), isPlayStart, `Play, ECID ${ecid}`);
    for (const operator of CONSECUTIVE_OPERATORS) {
      assert.equal(startsSequence(operator, ecid), isConsecutiveStart, `operator ${operator.primaryPlmn}, ECID ${ecid}`);
    }
  }
});

void test("gives no sector numbering to any other operator", () => {
  for (const operator of WITHOUT_RULE) assert.equal(lteSectorRule(operator), null, `operator ${operator.primaryPlmn}`);
});
