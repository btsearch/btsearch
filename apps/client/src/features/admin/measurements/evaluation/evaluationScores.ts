import type { EvaluationScore, ObservationEvaluation, ObservationEvaluationDetail } from "@openbts/shared/contract";

type EvaluationBreakdown = ObservationEvaluationDetail["breakdown"][number];
export type BreakdownRow = { value: string; scores: EvaluationBreakdown[] };
export type GnbLengthTest = ObservationEvaluationDetail["gnbLengths"][number];

type VersionedScore = Pick<EvaluationScore, "algorithmVersion">;
type CountryChange = { countryCode: string; change: number };

export type PublishCheck =
  | { kind: "median" | "p80"; isMet: boolean; candidateMeters: number; publishedMeters: number }
  | { kind: "radius"; isMet: boolean; share: number | null }
  | { kind: "countries"; isMet: boolean; worst: CountryChange | null };

const BASELINE_VERSION = 0;
const MEDIAN_WARNING_RATIO = 1.1;
const RADIUS_TARGET_MIN = 0.93;
const RADIUS_TARGET_MAX = 0.97;
const COUNTRY_MEDIAN_RISE_LIMIT = 0.1;
const APART_WARNING_SHARE = 0.1;

export function listVersions(scores: readonly VersionedScore[]): number[] {
  const versions = new Set(scores.map((score) => score.algorithmVersion).filter((version) => version !== BASELINE_VERSION));
  return [...versions].sort((left, right) => left - right);
}

export function findScore<T extends VersionedScore>(scores: readonly T[], version: number): T | undefined {
  return scores.find((score) => score.algorithmVersion === version);
}

export function findBaseline<T extends VersionedScore>(scores: readonly T[]): T | undefined {
  return findScore(scores, BASELINE_VERSION);
}

export function readShownVersion(evaluation: ObservationEvaluation, publishedVersion: number | undefined): number | undefined {
  const versions = listVersions(evaluation.overall);
  if (publishedVersion !== undefined && versions.includes(publishedVersion)) return publishedVersion;
  return versions.at(-1);
}

export function findCandidateVersion(versions: readonly number[], publishedVersion: number): number | undefined {
  return [...versions].reverse().find((version) => version !== publishedVersion);
}

export function readMedianRatio(evaluation: ObservationEvaluation, older: ObservationEvaluation | undefined, version: number): number | null {
  const current = findScore(evaluation.overall, version);
  const previous = older === undefined ? undefined : findScore(older.overall, version);
  if (current === undefined || previous === undefined || previous.errorMeters.p50 === 0) return null;
  return current.errorMeters.p50 / previous.errorMeters.p50;
}

export function isMedianRising(ratio: number | null): boolean {
  return ratio !== null && ratio >= MEDIAN_WARNING_RATIO;
}

export function readInsideShare(score: EvaluationScore): number | null {
  return score.insideRadius === null || score.sites === 0 ? null : score.insideRadius / score.sites;
}

export function readAmbiguousShare(score: EvaluationScore): number | null {
  return score.ambiguous === null || score.sites === 0 ? null : score.ambiguous / score.sites;
}

export function isRadiusOnTarget(share: number): boolean {
  return share >= RADIUS_TARGET_MIN && share <= RADIUS_TARGET_MAX;
}

function findWorstCountry(breakdown: readonly EvaluationBreakdown[], candidateVersion: number, publishedVersion: number): CountryChange | null {
  const countries = breakdown.filter((score) => score.dimension === "country");
  let worst: CountryChange | null = null;
  for (const candidate of countries) {
    if (candidate.algorithmVersion !== candidateVersion) continue;
    const published = countries.find((score) => score.value === candidate.value && score.algorithmVersion === publishedVersion);
    if (published === undefined || published.errorMeters.p50 === 0) continue;
    const change = candidate.errorMeters.p50 / published.errorMeters.p50 - 1;
    if (worst === null || change > worst.change) worst = { countryCode: candidate.value, change };
  }
  return worst;
}

export function readPublishChecks(evaluation: ObservationEvaluationDetail, candidate: EvaluationScore, published: EvaluationScore): PublishCheck[] {
  const share = readInsideShare(candidate);
  const worst = findWorstCountry(evaluation.breakdown, candidate.algorithmVersion, published.algorithmVersion);

  return [
    {
      kind: "median",
      isMet: candidate.errorMeters.p50 <= published.errorMeters.p50,
      candidateMeters: candidate.errorMeters.p50,
      publishedMeters: published.errorMeters.p50,
    },
    {
      kind: "p80",
      isMet: candidate.errorMeters.p80 <= published.errorMeters.p80,
      candidateMeters: candidate.errorMeters.p80,
      publishedMeters: published.errorMeters.p80,
    },
    { kind: "radius", isMet: share !== null && isRadiusOnTarget(share), share },
    { kind: "countries", isMet: worst === null || worst.change <= COUNTRY_MEDIAN_RISE_LIMIT, worst },
  ];
}

export function groupBreakdown(breakdown: readonly EvaluationBreakdown[], dimension: EvaluationBreakdown["dimension"]): BreakdownRow[] {
  const rows = new Map<string, EvaluationBreakdown[]>();
  for (const score of breakdown) {
    if (score.dimension !== dimension) continue;
    const scores = rows.get(score.value);
    if (scores === undefined) rows.set(score.value, [score]);
    else scores.push(score);
  }
  return [...rows].map(([value, scores]) => ({ value, scores }));
}

export function readRowSites(row: BreakdownRow, referenceVersion: number | undefined): number {
  const score = referenceVersion === undefined ? undefined : findScore(row.scores, referenceVersion);
  return (score ?? row.scores[0])?.sites ?? 0;
}

export function listShownGnbLengths(tests: readonly GnbLengthTest[]): GnbLengthTest[] {
  return tests
    .filter((test) => test.isCutLength || test.isSuggested)
    .sort((left, right) => left.plmn.localeCompare(right.plmn) || Number(right.isCutLength) - Number(left.isCutLength));
}

export function isApartHigh({ together, apart }: GnbLengthTest): boolean {
  const cells = together + apart;
  return cells > 0 && apart / cells >= APART_WARNING_SHARE;
}
