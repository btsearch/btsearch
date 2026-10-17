import type { StationIdentifierKind } from "@openbts/shared/contract";
import assert from "node:assert/strict";
import test from "node:test";

import type { OperatorRef } from "../../core/conventions.ts";
import { formatIdentifier, identifierKinds } from "../conventions/identifiers.ts";
import { FOREIGN_MEMBER, NETWORKS, ORANGE, PLAY, PLUS, TMOBILE, UNRELATED, WITHOUT_PLMN } from "./operators.ts";

const KINDS: [operator: OperatorRef, kinds: StationIdentifierKind[]][] = [
  [TMOBILE, ["networksId", "networksName", "operatorName"]],
  [ORANGE, ["networksId", "networksName", "operatorName"]],
  [PLUS, ["operatorName"]],
  [PLAY, ["operatorName"]],
  [NETWORKS, []],
  [UNRELATED, []],
  [FOREIGN_MEMBER, []],
  [WITHOUT_PLMN, []],
];

const FORMATS: [kind: StationIdentifierKind, value: string, shown: string][] = [
  ["networksId", "12345", "N!12345"],
  ["networksId", "1", "N!1"],
  ["networksId", "999999999", "N!999999999"],
  ["networksName", "WAW_CENTRUM", "WAW_CENTRUM"],
  ["operatorName", "Warszawa_12345", "Warszawa_12345"],
];

void test("lists the identifier kinds each operator's stations carry", () => {
  for (const [operator, kinds] of KINDS) assert.deepEqual(identifierKinds(operator), kinds, `operator ${operator.primaryPlmn}`);
});

void test("shows a NetWorkS id behind N! and leaves the other kinds as they are", () => {
  for (const [kind, value, shown] of FORMATS) assert.equal(formatIdentifier(kind, value), shown);
});
