import { type SQL, type SQLWrapper, sql } from "drizzle-orm";

const CONTRIBUTOR_BITS = 64;

export const CONFIRMING_PEOPLE = 2;
export const CONFIRMING_TRIPS = 2;

export function countPeople(contributorBits: bigint): number {
  let people = 0;
  for (let bits = BigInt.asUintN(CONTRIBUTOR_BITS, contributorBits); bits > 0n; bits &= bits - 1n) people++;
  return people;
}

export function namedByTwoPeople(contributorBits: SQLWrapper): SQL {
  return sql`bit_count(${contributorBits}::bit(64)) >= ${CONFIRMING_PEOPLE}`;
}
