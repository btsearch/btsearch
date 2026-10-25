import type { ObservationEvaluationDetail } from "@openbts/shared/contract";
import { SNAP_CANDIDATE_KINDS } from "@openbts/shared/contract/constants";
import { useTranslation } from "react-i18next";

import { formatCount } from "../utils/format";
import { findScore } from "./evaluationScores";
import { NO_VALUE, ScoreCardEmpty, ScoreCardHeadNote, ScoreCell, ScoreHead, ScoreRow, ScoreTable } from "./evaluationTable";
import { DashboardCard } from "@/features/admin/dashboard/cards/dashboardCard";

type Snap = ObservationEvaluationDetail["snapping"][number];
type SnapCount = "right" | "wrong" | "missed";

type SnappingCardProps = {
  snapping: readonly Snap[];
  versions: readonly number[];
  referenceVersion: number | undefined;
};

const SNAP_COUNTS = ["right", "wrong", "missed"] as const satisfies readonly SnapCount[];

export function SnappingCard({ snapping, versions, referenceVersion }: SnappingCardProps) {
  const { t, i18n } = useTranslation("admin");
  const kinds = SNAP_CANDIDATE_KINDS.filter((kind) => snapping.some((snap) => snap.kind === kind));

  function joinVersions(snaps: readonly Snap[], count: SnapCount): string {
    return versions
      .map((version) => {
        const snap = findScore(snaps, version);
        return snap === undefined ? NO_VALUE : formatCount(snap[count], i18n.language);
      })
      .join(" / ");
  }

  return (
    <DashboardCard
      title={t("measurements.evaluation.snapping.title")}
      headEnd={
        <ScoreCardHeadNote>{versions.map((version) => t("measurements.evaluation.snapping.versionName", { version })).join(" / ")}</ScoreCardHeadNote>
      }
    >
      {kinds.length === 0 ? (
        <ScoreCardEmpty>{t("measurements.evaluation.noData")}</ScoreCardEmpty>
      ) : (
        <ScoreTable
          head={
            <>
              <ScoreHead align="start">{t("measurements.evaluation.snapping.source")}</ScoreHead>
              <ScoreHead>{t("measurements.evaluation.snapping.possible")}</ScoreHead>
              {SNAP_COUNTS.map((count) => (
                <ScoreHead key={count}>{t(`measurements.evaluation.snapping.${count}`)}</ScoreHead>
              ))}
            </>
          }
        >
          {kinds.map((kind) => {
            const snaps = snapping.filter((snap) => snap.kind === kind);
            const reference = (referenceVersion === undefined ? undefined : findScore(snaps, referenceVersion)) ?? snaps[0];
            return (
              <ScoreRow key={kind}>
                <ScoreCell align="start" className="w-full">
                  {t(`measurements.evaluation.snapping.kinds.${kind}`)}
                </ScoreCell>
                <ScoreCell>{reference === undefined ? NO_VALUE : formatCount(reference.possible, i18n.language)}</ScoreCell>
                {SNAP_COUNTS.map((count) => (
                  <ScoreCell key={count}>{joinVersions(snaps, count)}</ScoreCell>
                ))}
              </ScoreRow>
            );
          })}
        </ScoreTable>
      )}
    </DashboardCard>
  );
}
