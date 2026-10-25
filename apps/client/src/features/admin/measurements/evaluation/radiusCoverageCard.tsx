import type { ObservationEvaluationDetail } from "@openbts/shared/contract";
import { EVIDENCE_CLASSES } from "@openbts/shared/contract/constants";
import { useTranslation } from "react-i18next";

import { formatCount } from "../utils/format";
import { type BreakdownRow, findScore, groupBreakdown, readInsideShare, readRowSites } from "./evaluationScores";
import { InsideShareCell, ScoreCardEmpty, ScoreCardHeadNote, ScoreCardNote, ScoreCell, ScoreHead, ScoreRow, ScoreTable } from "./evaluationTable";
import { DashboardCard } from "@/features/admin/dashboard/cards/dashboardCard";

type RadiusCoverageCardProps = {
  evaluation: ObservationEvaluationDetail;
  versions: readonly number[];
  referenceVersion: number | undefined;
};

type EvidenceClass = (typeof EVIDENCE_CLASSES)[number];
type EvidenceRow = BreakdownRow & { value: EvidenceClass };

function isEvidenceRow(row: BreakdownRow): row is EvidenceRow {
  return EVIDENCE_CLASSES.some((evidenceClass) => evidenceClass === row.value);
}

function sortEvidenceRows(rows: BreakdownRow[]): EvidenceRow[] {
  return rows.filter(isEvidenceRow).sort((left, right) => EVIDENCE_CLASSES.indexOf(left.value) - EVIDENCE_CLASSES.indexOf(right.value));
}

function readVersionShare(row: BreakdownRow, version: number): number | null {
  const score = findScore(row.scores, version);
  return score === undefined ? null : readInsideShare(score);
}

export function RadiusCoverageCard({ evaluation, versions, referenceVersion }: RadiusCoverageCardProps) {
  const { t, i18n } = useTranslation("admin");
  const rows = sortEvidenceRows(groupBreakdown(evaluation.breakdown, "evidenceClass"));

  return (
    <DashboardCard
      title={t("measurements.evaluation.coverage.title")}
      headEnd={<ScoreCardHeadNote>{t("measurements.evaluation.coverage.headEnd")}</ScoreCardHeadNote>}
      footer={<ScoreCardNote>{t("measurements.evaluation.coverage.note")}</ScoreCardNote>}
    >
      {rows.length === 0 ? (
        <ScoreCardEmpty>{t("measurements.evaluation.noData")}</ScoreCardEmpty>
      ) : (
        <ScoreTable
          head={
            <>
              <ScoreHead align="start">{t("measurements.evaluation.coverage.evidence")}</ScoreHead>
              <ScoreHead>{t("measurements.evaluation.columns.sites")}</ScoreHead>
              {versions.map((version) => (
                <ScoreHead key={version}>{t("measurements.evaluation.versionName", { version })}</ScoreHead>
              ))}
            </>
          }
        >
          {rows.map((row) => (
            <ScoreRow key={row.value}>
              <ScoreCell align="start" className="w-full">
                {t(`measurements.evaluation.coverage.classes.${row.value}`)}
              </ScoreCell>
              <ScoreCell>{formatCount(readRowSites(row, referenceVersion), i18n.language)}</ScoreCell>
              {versions.map((version) => (
                <InsideShareCell key={version} share={readVersionShare(row, version)} />
              ))}
            </ScoreRow>
          ))}
        </ScoreTable>
      )}
    </DashboardCard>
  );
}
