import { evaluationRuns, gnbLengthTests } from "@openbts/drizzle";
import { desc, eq } from "drizzle-orm";

import db from "../../../database/psql.js";
import { unique } from "../../../lib/collections.js";
import { loadNetworks } from "../networks.js";
import type { FlagFindings } from "./kinds.js";
import { networkSubject } from "./subjects.js";
import { type FlagSyncCounts, NOTHING_SYNCED, flagsIn, syncFlags } from "./sync.js";

const NEAR_THE_BEST = 0.95;
const LEAST_CELLS_TOGETHER = 20;

export type LengthTest = { plmn: string; length: number; isCutLength: boolean; together: number; apart: number; sites: number };

function scoreOf({ together, apart }: LengthTest): number {
  return together - apart;
}

export function suggestedLengthOf(tests: readonly LengthTest[]): LengthTest | undefined {
  const best = Math.max(...tests.map(scoreOf));
  if (best <= 0) return undefined;
  return tests.filter((test) => scoreOf(test) >= NEAR_THE_BEST * best).toSorted((a, b) => a.length - b.length)[0];
}

export function raiseGnbLengthFlags(tests: readonly LengthTest[], countryOf: ReadonlyMap<string, string>): FlagFindings<"gnbLengthSuggestion"> {
  const findings: FlagFindings<"gnbLengthSuggestion"> = { raised: [], fixed: [] };
  for (const [plmn, network] of Map.groupBy(tests, (test) => test.plmn)) {
    const cut = network.find((test) => test.isCutLength);
    const suggested = suggestedLengthOf(network);
    if (cut === undefined || suggested === undefined) continue;
    if (suggested.length === cut.length) {
      findings.fixed.push({ kind: "gnbLengthSuggestion", subjectKey: networkSubject(plmn) });
      continue;
    }
    if (suggested.together < LEAST_CELLS_TOGETHER) continue;

    findings.raised.push({
      kind: "gnbLengthSuggestion",
      subjectKey: networkSubject(plmn),
      refs: { countryCode: countryOf.get(plmn) ?? null },
      evidence: { plmn, length: cut.length, suggestedLength: suggested.length, siteCount: cut.sites },
      suggestion: null,
      measure: { length: cut.length, suggestedLength: suggested.length },
    });
  }
  return findings;
}

export async function syncGnbLengthFlags(): Promise<FlagSyncCounts> {
  const [latest] = await db
    .select({ id: gnbLengthTests.evaluationRunId })
    .from(gnbLengthTests)
    .innerJoin(evaluationRuns, eq(evaluationRuns.id, gnbLengthTests.evaluationRunId))
    .orderBy(desc(evaluationRuns.runAt), desc(evaluationRuns.id))
    .limit(1);
  if (latest === undefined) return NOTHING_SYNCED;

  const tests = await db.select().from(gnbLengthTests).where(eq(gnbLengthTests.evaluationRunId, latest.id));
  const networks = await loadNetworks(unique(tests.map((test) => test.plmn)));
  const countryOf = new Map([...networks].map(([plmn, network]) => [plmn, network.countryCode]));
  const { raised, fixed } = raiseGnbLengthFlags(tests, countryOf);
  return db.transaction((tx) => syncFlags(tx, { kinds: ["gnbLengthSuggestion"], raised, fixed: flagsIn(fixed) }));
}
