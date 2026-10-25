import type { ObservationEvaluationDetail } from "@openbts/shared/contract";
import { useTranslation } from "react-i18next";

import { formatCount } from "../utils/format";
import { type BreakdownRow, findBaseline, findScore, groupBreakdown, readRowSites } from "./evaluationScores";
import { NO_VALUE, ScoreCardEmpty, ScoreCardHeadNote, ScoreCardNote, ScoreCell, ScoreHead, ScoreRow, ScoreTable } from "./evaluationTable";
import { DashboardCard } from "@/features/admin/dashboard/cards/dashboardCard";

type RatErrorsCardProps = {
  evaluation: ObservationEvaluationDetail;
  versions: readonly number[];
  referenceVersion: number | undefined;
};

const UNKNOWN_RAT = "unknown";

function sortRatRows(rows: BreakdownRow[], referenceVersion: number | undefined): BreakdownRow[] {
  return rows.sort((left, right) => {
    if (left.value === UNKNOWN_RAT || right.value === UNKNOWN_RAT) return Number(left.value === UNKNOWN_RAT) - Number(right.value === UNKNOWN_RAT);
    return readRowSites(right, referenceVersion) - readRowSites(left, referenceVersion);
  });
}

export function RatErrorsCard({ evaluation, versions, referenceVersion }: RatErrorsCardProps) {
  const { t, i18n } = useTranslation("admin");
  const rows = sortRatRows(groupBreakdown(evaluation.breakdown, "rat"), referenceVersion);

  return (
    <DashboardCard
      title={t("measurements.evaluation.rats.title")}
      headEnd={<ScoreCardHeadNote>{t("measurements.evaluation.rats.headEnd")}</ScoreCardHeadNote>}
      footer={<ScoreCardNote>{t("measurements.evaluation.rats.note")}</ScoreCardNote>}
    >
      {rows.length === 0 ? (
        <ScoreCardEmpty>{t("measurements.evaluation.noData")}</ScoreCardEmpty>
      ) : (
        <ScoreTable
          head={
            <>
              <ScoreHead align="start">{t("measurements.evaluation.rats.technology")}</ScoreHead>
              <ScoreHead>{t("measurements.evaluation.columns.sites")}</ScoreHead>
              {versions.map((version) => (
                <ScoreHead key={version}>{t("measurements.evaluation.versionName", { version })}</ScoreHead>
              ))}
              <ScoreHead>{t("measurements.evaluation.baseline")}</ScoreHead>
            </>
          }
        >
          {rows.map((row) => {
            const baseline = findBaseline(row.scores);
            return (
              <ScoreRow key={row.value}>
                <ScoreCell align="start" className="w-full font-medium">
                  {row.value === UNKNOWN_RAT ? t("measurements.evaluation.rats.unknown") : row.value.toUpperCase()}
                </ScoreCell>
                <ScoreCell>{formatCount(readRowSites(row, referenceVersion), i18n.language)}</ScoreCell>
                {versions.map((version) => {
                  const score = findScore(row.scores, version);
                  if (score === undefined) {
                    return (
                      <ScoreCell key={version} tone="muted">
                        {NO_VALUE}
                      </ScoreCell>
                    );
                  }
                  const { p50, p80, p95 } = score.errorMeters;
                  return <ScoreCell key={version}>{[p50, p80, p95].map((meters) => formatCount(meters, i18n.language)).join(" / ")}</ScoreCell>;
                })}
                <ScoreCell tone="muted">
                  {baseline === undefined ? NO_VALUE : t("measurements.meters", { value: baseline.errorMeters.p50 })}
                </ScoreCell>
              </ScoreRow>
            );
          })}
        </ScoreTable>
      )}
    </DashboardCard>
  );
}
