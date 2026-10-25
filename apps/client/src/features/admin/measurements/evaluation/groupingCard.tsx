import type { ObservationEvaluationDetail } from "@openbts/shared/contract";
import { useTranslation } from "react-i18next";

import { formatCount } from "../utils/format";
import { ScoreCardEmpty, ScoreCardNote, ScoreCell, ScoreHead, ScoreRow, ScoreTable } from "./evaluationTable";
import { DashboardCard } from "@/features/admin/dashboard/cards/dashboardCard";

export function GroupingCard({ grouping }: { grouping: ObservationEvaluationDetail["grouping"] }) {
  const { t, i18n } = useTranslation("admin");
  const rows = [...grouping].sort((left, right) => left.algorithmVersion - right.algorithmVersion);

  return (
    <DashboardCard
      title={t("measurements.evaluation.grouping.title")}
      footer={<ScoreCardNote>{t("measurements.evaluation.grouping.note")}</ScoreCardNote>}
    >
      {rows.length === 0 ? (
        <ScoreCardEmpty>{t("measurements.evaluation.noData")}</ScoreCardEmpty>
      ) : (
        <ScoreTable
          head={
            <>
              <ScoreHead align="start">{t("measurements.evaluation.columns.version")}</ScoreHead>
              <ScoreHead>{t("measurements.evaluation.grouping.groups")}</ScoreHead>
              <ScoreHead>{t("measurements.evaluation.grouping.right")}</ScoreHead>
              <ScoreHead>{t("measurements.evaluation.grouping.wrong")}</ScoreHead>
              <ScoreHead>{t("measurements.evaluation.grouping.missed")}</ScoreHead>
            </>
          }
        >
          {rows.map((row) => (
            <ScoreRow key={row.algorithmVersion}>
              <ScoreCell align="start" className="w-full font-medium">
                {t("measurements.evaluation.versionName", { version: row.algorithmVersion })}
              </ScoreCell>
              <ScoreCell>{formatCount(row.groups, i18n.language)}</ScoreCell>
              <ScoreCell>{formatCount(row.right, i18n.language)}</ScoreCell>
              <ScoreCell>{formatCount(row.wrong, i18n.language)}</ScoreCell>
              <ScoreCell>{formatCount(row.missed, i18n.language)}</ScoreCell>
            </ScoreRow>
          ))}
        </ScoreTable>
      )}
    </DashboardCard>
  );
}
