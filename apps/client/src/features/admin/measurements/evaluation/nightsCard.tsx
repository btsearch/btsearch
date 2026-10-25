import { Alert02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ObservationEvaluation } from "@openbts/shared/contract";
import { useTranslation } from "react-i18next";

import { formatSignedChange } from "../utils/format";
import { findScore, isMedianRising, listVersions, readMedianRatio, readShownVersion } from "./evaluationScores";
import { NO_VALUE } from "./evaluationTable";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { DashboardCard } from "@/features/admin/dashboard/cards/dashboardCard";
import { WARNING_TEXT_CLASS } from "@/features/admin/settings/components/classNames";
import { SettingsCardNote } from "@/features/settings/components/settingsPrimitives";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type NightsCardProps = {
  evaluations: readonly ObservationEvaluation[];
  selectedId: number | undefined;
  publishedVersion: number | undefined;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onSelect: (id: number) => void;
  onShowMore: () => void;
};

type NightRowProps = {
  evaluation: ObservationEvaluation;
  older: ObservationEvaluation | undefined;
  publishedVersion: number | undefined;
  isSelected: boolean;
  onSelect: (id: number) => void;
};

function NightRow({ evaluation, older, publishedVersion, isSelected, onSelect }: NightRowProps) {
  const { t, i18n } = useTranslation("admin");
  const shownVersion = readShownVersion(evaluation, publishedVersion);
  const score = shownVersion === undefined ? undefined : findScore(evaluation.overall, shownVersion);
  const ratio = shownVersion === undefined ? null : readMedianRatio(evaluation, older, shownVersion);
  const isRising = isMedianRising(ratio);
  const versionCount = listVersions(evaluation.overall).length;

  const meta = [
    t(`measurements.evaluation.nights.half.${evaluation.scoredHalf}`),
    t("measurements.evaluation.nights.stations", { count: evaluation.groundTruthStations }),
  ];
  if (versionCount > 1) meta.push(t("measurements.evaluation.nights.versions", { count: versionCount }));

  return (
    <button
      type="button"
      aria-pressed={isSelected}
      onClick={() => onSelect(evaluation.id)}
      className={cn(
        "flex w-full cursor-pointer items-center gap-3 border-b px-4 py-[9px] text-left text-sm transition-colors outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        isSelected && "bg-muted hover:bg-muted",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{formatShortDate(evaluation.runAt, i18n.language)}</span>
        <span className="block truncate text-xs text-muted-foreground">{meta.join(", ")}</span>
      </span>
      <span className="shrink-0 text-right tabular-nums">
        <span className="block font-semibold">{score === undefined ? NO_VALUE : t("measurements.meters", { value: score.errorMeters.p50 })}</span>
        <span className={cn("flex items-center justify-end gap-1 text-xs", isRising ? WARNING_TEXT_CLASS : "text-muted-foreground")}>
          {isRising ? <HugeiconsIcon icon={Alert02Icon} aria-hidden="true" className="size-3" /> : null}
          {ratio === null ? NO_VALUE : formatSignedChange(ratio - 1, i18n.language)}
        </span>
      </span>
    </button>
  );
}

export function NightsCard({ evaluations, selectedId, publishedVersion, hasNextPage, isFetchingNextPage, onSelect, onShowMore }: NightsCardProps) {
  const { t } = useTranslation("admin");

  return (
    <DashboardCard
      title={t("measurements.evaluation.nights.title")}
      headEnd={<span className="text-xs text-muted-foreground">{t("measurements.evaluation.nights.headEnd")}</span>}
      footer={<SettingsCardNote className="border-t-0 sm:px-4">{t("measurements.evaluation.nights.note")}</SettingsCardNote>}
    >
      {evaluations.map((evaluation, index) => (
        <NightRow
          key={evaluation.id}
          evaluation={evaluation}
          older={evaluations[index + 1]}
          publishedVersion={publishedVersion}
          isSelected={evaluation.id === selectedId}
          onSelect={onSelect}
        />
      ))}
      {hasNextPage ? (
        <div className="border-b p-1.5">
          <Button type="button" variant="ghost" size="sm" className="w-full cursor-pointer" disabled={isFetchingNextPage} onClick={onShowMore}>
            {isFetchingNextPage ? <Spinner /> : null}
            {t("common:actions.showMore")}
          </Button>
        </div>
      ) : null}
    </DashboardCard>
  );
}
