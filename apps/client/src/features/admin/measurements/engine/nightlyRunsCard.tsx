import type { EngineRun } from "@openbts/shared/contract";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { evaluationsQueryOptions } from "../api/evaluations";
import { findScore, isMedianRising, readMedianRatio } from "../evaluation/evaluationScores";
import { formatDayTime } from "../utils/format";
import { EngineCardFooter, EngineFact, EngineFacts, EngineRunStateBadge } from "./engineCardParts";
import { getEngineRunState } from "./engineRuns";
import { CARD_FOOTER_LINK_CLASS, CardFooterLinkIcon, DashboardCard } from "@/features/admin/dashboard/cards/dashboardCard";
import { WARNING_TEXT_CLASS } from "@/features/admin/settings/components/classNames";
import { useSettings } from "@/hooks/useSettings";
import { formatTime, isSameDay } from "@/lib/format";
import { cn } from "@/lib/utils";

const SHOWN_NIGHTLY_RUNS = 3;

function NightlyRunRow({ run }: { run: EngineRun }) {
  const { t, i18n } = useTranslation("admin");
  const { startedAt, finishedAt } = run;

  let when = formatDayTime(startedAt ?? run.createdAt, i18n.language);
  if (startedAt !== null && finishedAt !== null) {
    const end = isSameDay(startedAt, finishedAt) ? formatTime(finishedAt, i18n.language) : formatDayTime(finishedAt, i18n.language);
    when = t("measurements.engine.span", { start: when, end });
  }

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-[7px]">
      <div className="min-w-0 text-sm">
        <span className="font-semibold">{t(`measurements.engine.runKinds.${run.kind}`)}</span>
        <span className="ml-2 text-[13px] text-muted-foreground tabular-nums">{when}</span>
      </div>
      <EngineRunStateBadge state={getEngineRunState(run)} />
    </div>
  );
}

function PublishedMedian({ version }: { version: number }) {
  const { t } = useTranslation("admin");
  const evaluationsQuery = useInfiniteQuery(evaluationsQueryOptions());
  const [latest, previous] = evaluationsQuery.data?.pages[0]?.data ?? [];
  const latestScore = latest === undefined ? undefined : findScore(latest.overall, version);
  if (latest === undefined || latestScore === undefined) return null;

  const previousScore = previous === undefined ? undefined : findScore(previous.overall, version);
  const isRising = isMedianRising(readMedianRatio(latest, previous, version));

  return (
    <EngineFacts className="border-t pt-1 pb-1.5">
      <EngineFact label={t("measurements.engine.nightly.median", { version })} valueClassName={isRising ? WARNING_TEXT_CLASS : undefined}>
        {t("measurements.meters", { value: latestScore.errorMeters.p50 })}
        {previousScore === undefined ? null : (
          <span className={cn("ml-1 font-normal", isRising ? null : "text-muted-foreground")}>
            {t("measurements.engine.nightly.previousNight", { value: previousScore.errorMeters.p50 })}
          </span>
        )}
      </EngineFact>
    </EngineFacts>
  );
}

export function NightlyRunsCard({ runs }: { runs: readonly EngineRun[] }) {
  const { t } = useTranslation("admin");
  const { data: settings } = useSettings();
  const publishedVersion = settings?.measurements?.publishedAlgorithmVersion;
  const shownRuns = runs.slice(0, SHOWN_NIGHTLY_RUNS);

  return (
    <DashboardCard
      title={t("measurements.engine.nightly.title")}
      footer={
        <EngineCardFooter note={t("measurements.engine.nightly.note")}>
          <Link to="/admin/measurements/evaluation" className={CARD_FOOTER_LINK_CLASS}>
            {t("measurements.tabs.evaluation")}
            <CardFooterLinkIcon />
          </Link>
        </EngineCardFooter>
      }
    >
      {shownRuns.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">{t("measurements.engine.nightly.empty")}</p>
      ) : (
        <div className="py-1">
          {shownRuns.map((run) => (
            <NightlyRunRow key={run.id} run={run} />
          ))}
        </div>
      )}
      {publishedVersion === undefined ? null : <PublishedMedian version={publishedVersion} />}
    </DashboardCard>
  );
}
