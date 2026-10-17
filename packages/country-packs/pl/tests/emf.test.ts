import assert from "node:assert/strict";
import test from "node:test";

import { SI2PEM_NAME_TO_PLMN } from "../emf.ts";

const SENT_NAMES: [plmn: string, name: string][] = [
  ["26001", "Towerlink Poland Sp. z o.o."],
  ["26002", "T-Mobile Polska S.A."],
  ["26003", "Orange Polska S.A."],
  ["26006", "P4 Sp. z o.o."],
];

void test("reads every name it sends as the same operator", () => {
  for (const [plmn, name] of SENT_NAMES) assert.equal(SI2PEM_NAME_TO_PLMN[name], plmn);
});
