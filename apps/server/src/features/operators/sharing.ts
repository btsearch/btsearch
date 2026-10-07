import { operatorLinks, operators, plmns } from "@openbts/drizzle";
import { type AnyColumn, type SQL, type SQLWrapper, and, eq, inArray, notInArray, sql } from "drizzle-orm";

import db from "../../database/psql.js";

export function operatedBy(operatorId: AnyColumn, operatorIds: readonly number[]): SQL {
  const members = db
    .select({ id: operatorLinks.operatorId })
    .from(operatorLinks)
    .where(and(inArray(operatorLinks.relatedOperatorId, [...operatorIds]), eq(operatorLinks.kind, "jv_member")));

  return sql`(${inArray(operatorId, [...operatorIds])} OR ${inArray(operatorId, members)})`;
}

export function outsideCountriesOf(countryCode: SQLWrapper, operatorIds: readonly number[]): SQL {
  const operatorCountries = db.select({ code: operators.countryCode }).from(operators).where(operatedBy(operators.id, operatorIds));

  return notInArray(countryCode, operatorCountries);
}

export function hasPlmn(operatorId: AnyColumn, codes: readonly string[]): SQL {
  const byCode = db
    .select({ id: plmns.operatorId })
    .from(plmns)
    .where(inArray(plmns.code, [...codes]));
  const byLegacyNumber = db
    .select({ id: operators.id })
    .from(operators)
    .where(inArray(operators.mnc, codes.map(Number)));

  return sql`(${inArray(operatorId, byCode)} OR ${inArray(operatorId, byLegacyNumber)})`;
}
