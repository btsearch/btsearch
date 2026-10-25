import { cellNetworks, operators, plmns } from "@openbts/drizzle";
import { plmnCandidates } from "@openbts/shared/operatorUtils";
import { type SQL, type SQLWrapper, and, eq, inArray, isNotNull, notExists, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import db from "../../database/psql.js";
import { unique } from "../../lib/collections.js";
import { operatedBy } from "../operators/sharing.js";
import { namedByTwoPeople } from "./cells/confirmation.js";

export type Network = { operatorId: number; countryCode: string };

const takenCode = alias(plmns, "taken_code");

export function withCodeVariants(codes: readonly string[]): string[] {
  return unique(codes.flatMap(plmnCandidates));
}

function otherMncLength(code: SQLWrapper): SQL<string | null> {
  return sql<string | null>`CASE
    WHEN length(${code}) = 5 THEN left(${code}, 3) || '0' || right(${code}, 2)
    WHEN substr(${code}, 4, 1) = '0' THEN left(${code}, 3) || right(${code}, 2)
  END`;
}

export function selectReportedCodes() {
  const ownCodes = db.select({ reportedCode: sql<string>`${plmns.code}`.as("reported_code"), operatorId: plmns.operatorId }).from(plmns);
  const otherLength = otherMncLength(plmns.code);
  const isTaken = db.select({ id: takenCode.id }).from(takenCode).where(eq(takenCode.code, otherLength));
  const otherLengthCodes = db
    .select({ reportedCode: sql<string>`${otherLength}`.as("reported_code"), operatorId: plmns.operatorId })
    .from(plmns)
    .where(and(isNotNull(otherLength), notExists(isTaken)));
  return ownCodes.unionAll(otherLengthCodes).as("reported_code");
}

export async function findOperatorCodes(operatorIds: readonly number[]): Promise<string[]> {
  const reported = selectReportedCodes();
  const rows = await db.select({ code: reported.reportedCode }).from(reported).where(operatedBy(reported.operatorId, operatorIds));
  return rows.map((row) => row.code);
}

export async function loadNetworks(codes: readonly string[]): Promise<Map<string, Network>> {
  if (codes.length === 0) return new Map();

  const reported = selectReportedCodes();
  const rows = await db
    .select({ code: reported.reportedCode, operatorId: reported.operatorId, countryCode: operators.countryCode })
    .from(reported)
    .innerJoin(operators, eq(operators.id, reported.operatorId))
    .where(inArray(reported.reportedCode, unique(codes)));
  return new Map(rows.map(({ code, ...network }) => [code, network]));
}

export async function loadConfirmedNetworks(observedCellIds: readonly number[]): Promise<Map<number, string[]>> {
  if (observedCellIds.length === 0) return new Map();

  const rows = await db
    .select({ observedCellId: cellNetworks.observedCellId, plmn: cellNetworks.plmn })
    .from(cellNetworks)
    .where(and(inArray(cellNetworks.observedCellId, [...observedCellIds]), namedByTwoPeople(cellNetworks.contributorBits)))
    .orderBy(cellNetworks.observedCellId, cellNetworks.plmn);
  return new Map(
    [...Map.groupBy(rows, (row) => row.observedCellId)].map(([observedCellId, named]) => [observedCellId, named.map((row) => row.plmn)]),
  );
}
