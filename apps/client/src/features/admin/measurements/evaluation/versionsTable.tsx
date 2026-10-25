import type { EvaluationScore } from "@openbts/shared/contract";
import { useTranslation } from "react-i18next";

import { formatCount, formatShare } from "../utils/format";
import { findBaseline, findScore, readAmbiguousShare, readInsideShare } from "./evaluationScores";
import { InsideShareCell, NO_VALUE, ScoreCell, ScoreHead, ScoreRow, ScoreTable } from "./evaluationTable";
import { StatusBadge } from "@/features/settings/components/settingsPrimitives";

type VersionsTableProps = {
  overall: readonly EvaluationScore[];
  versions: readonly number[];
  publishedVersion: number | undefined;
};

type VersionRowProps = {
  score: EvaluationScore;
  isBaseline: boolean;
  isPublished: boolean;
  hasPublished: boolean;
};

function VersionTag({ isPublished }: { isPublished: boolean }) {
  const { t } = useTranslation("admin");

  if (isPublished) return <StatusBadge tone="success">{t("measurements.evaluation.report.published")}</StatusBadge>;
  return <StatusBadge tone="muted">{t("measurements.evaluation.report.background")}</StatusBadge>;
}

function VersionRow({ score, isBaseline, isPublished, hasPublished }: VersionRowProps) {
  const { t, i18n } = useTranslation("admin");
  const ambiguousShare = readAmbiguousShare(score);

  return (
    <ScoreRow className="h-12">
      <ScoreCell align="start" className="w-full max-w-0 min-w-56">
        <span className="flex min-w-0 items-center gap-2">
          <span className="font-medium">
            {isBaseline ? t("measurements.evaluation.baseline") : t("measurements.evaluation.versionName", { version: score.algorithmVersion })}
          </span>
          {isBaseline || !hasPublished ? null : <VersionTag isPublished={isPublished} />}
          {isBaseline ? (
            <span className="min-w-0 truncate text-xs text-muted-foreground">{t("measurements.evaluation.report.baselineNote")}</span>
          ) : null}
        </span>
      </ScoreCell>
      <ScoreCell>{formatCount(score.sites, i18n.language)}</ScoreCell>
      <ScoreCell className="font-semibold">{t("measurements.meters", { value: score.errorMeters.p50 })}</ScoreCell>
      <ScoreCell>{t("measurements.meters", { value: score.errorMeters.p80 })}</ScoreCell>
      <ScoreCell>{t("measurements.meters", { value: score.errorMeters.p95 })}</ScoreCell>
      <InsideShareCell share={readInsideShare(score)} />
      <ScoreCell tone={ambiguousShare === null ? "muted" : "default"}>
        {ambiguousShare === null ? NO_VALUE : formatShare(ambiguousShare, i18n.language)}
      </ScoreCell>
    </ScoreRow>
  );
}

export function VersionsTable({ overall, versions, publishedVersion }: VersionsTableProps) {
  const { t } = useTranslation("admin");
  const baseline = findBaseline(overall);
  const hasPublished = publishedVersion !== undefined;

  return (
    <ScoreTable
      head={
        <>
          <ScoreHead align="start">{t("measurements.evaluation.columns.version")}</ScoreHead>
          <ScoreHead>{t("measurements.evaluation.columns.sites")}</ScoreHead>
          <ScoreHead>{t("measurements.evaluation.columns.median")}</ScoreHead>
          <ScoreHead>{t("measurements.evaluation.columns.p80")}</ScoreHead>
          <ScoreHead>{t("measurements.evaluation.columns.p95")}</ScoreHead>
          <ScoreHead>{t("measurements.evaluation.columns.insideRadius")}</ScoreHead>
          <ScoreHead>{t("measurements.evaluation.columns.ambiguous")}</ScoreHead>
        </>
      }
    >
      {[...versions].reverse().map((version) => {
        const score = findScore(overall, version);
        if (score === undefined) return null;
        return <VersionRow key={version} score={score} isBaseline={false} isPublished={version === publishedVersion} hasPublished={hasPublished} />;
      })}
      {baseline === undefined ? null : <VersionRow score={baseline} isBaseline isPublished={false} hasPublished={hasPublished} />}
    </ScoreTable>
  );
}
