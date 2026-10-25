import { TaskDone02Icon } from "@hugeicons/core-free-icons";
import type { ObservationFlag } from "@openbts/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import {
  CARD_FOOTER_LINK_CLASS,
  CardFooter,
  CardFooterLinkIcon,
  CardLoadError,
  CardLoading,
  CardNotice,
  CardStaleNotice,
  DashboardCard,
  type QueueSwitch,
  ROW_CONTENT_CLASS,
  ROW_LINK_CLASS,
  SystemSettingsLink,
  getCardView,
  hasStaleRows,
} from "./dashboardCard";
import { RelativeTime } from "@/components/ui/relative-time";
import { Skeleton } from "@/components/ui/skeleton";
import { dashboardFlagsQueryOptions } from "@/features/admin/observation-flags/api/flags";
import { EstimatedLabel, FlagSubjectMark } from "@/features/admin/observation-flags/components/flagSubjectMark";
import { type FlagTextContext, getFlagSubject, getFlagSummary } from "@/features/admin/observation-flags/model/flagText";
import { getKindLabel } from "@/features/admin/observation-flags/model/kinds";
import { type MapLookups, getOperatorLook } from "@/features/map/data/mapLookups";
import { cn } from "@/lib/utils";

type ObservationFlagsCardProps = {
  queueSwitch: QueueSwitch;
  isAdmin: boolean;
  lookups: MapLookups | undefined;
};

type FlagCardRowProps = {
  flag: ObservationFlag;
  ctx: FlagTextContext;
};

const SKELETON_ROW_COUNT = 5;
const NO_FLAGS: ObservationFlag[] = [];

function FlagCardRow({ flag, ctx }: FlagCardRowProps) {
  const { t } = ctx;
  const subject = getFlagSubject(flag, ctx);
  const { operator, brand } = getOperatorLook(ctx.lookups, subject.operatorId);
  const kind = getKindLabel(flag.kind, t);
  const summary = getFlagSummary(flag, ctx);

  return (
    <li className="relative transition-colors hover:bg-muted/50">
      <Link
        to="/admin/observation-flags"
        search={{ flag: flag.id }}
        className={ROW_LINK_CLASS}
        aria-label={t("dashboard.openFlag", { label: `${kind}, ${subject.text}` })}
      />
      <div className={cn(ROW_CONTENT_CLASS, "flex flex-col gap-0.5 px-4 py-2.5")}>
        <span className="flex min-w-0 items-center gap-1.5">
          <FlagSubjectMark subject={subject} operator={operator} brand={brand} size={16} />
          <span className={cn("min-w-0 truncate text-[13px] font-semibold tabular-nums", subject.isMono ? "font-mono" : null)}>{subject.text}</span>
          {subject.isEstimated ? <EstimatedLabel /> : null}
          <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
            <RelativeTime date={flag.createdAt} />
          </span>
        </span>
        <span className="truncate text-xs leading-4 text-muted-foreground">
          <span className="font-semibold text-foreground/80">{kind}</span>
          {summary === "" ? null : ` · ${summary}`}
        </span>
      </div>
    </li>
  );
}

function FlagCardRowSkeleton() {
  return (
    <div className="flex flex-col gap-2 px-4 py-3" aria-hidden="true">
      <span className="flex items-center gap-2">
        <Skeleton className="size-4" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="ml-auto h-3 w-12" />
      </span>
      <Skeleton className="h-3 w-44" />
    </div>
  );
}

export function ObservationFlagsCard({ queueSwitch, isAdmin, lookups }: ObservationFlagsCardProps) {
  const { t, i18n } = useTranslation(["admin", "nav"]);
  const query = useQuery({ ...dashboardFlagsQueryOptions(), enabled: queueSwitch === "on" });
  const flags = query.data?.data ?? NO_FLAGS;
  const total = query.data?.paging.total ?? flags.length;
  const view = queueSwitch === "off" ? "off" : getCardView(query, flags.length);
  const isListed = view === "ready" || view === "empty";
  const ctx: FlagTextContext = { t, language: i18n.language, lookups };

  return (
    <DashboardCard
      title={t("nav:items.observationFlags")}
      count={isListed ? total : undefined}
      isBusy={view === "loading"}
      className="shrink-0"
      notice={view === "ready" && hasStaleRows(query) ? <CardStaleNotice onRetry={query.refetch} isRetrying={query.isFetching} /> : null}
      footer={
        view === "ready" ? (
          <CardFooter shown={flags.length} total={total}>
            <Link to="/admin/observation-flags" search={{}} className={CARD_FOOTER_LINK_CLASS}>
              {t("dashboard.allFlags")}
              <CardFooterLinkIcon />
            </Link>
          </CardFooter>
        ) : null
      }
    >
      {view === "off" ? <CardNotice title={t("observationFlags.access.offTitle")} action={isAdmin ? <SystemSettingsLink /> : undefined} /> : null}
      {view === "loading" ? (
        <CardLoading className="divide-y">
          {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
            <FlagCardRowSkeleton key={index} />
          ))}
        </CardLoading>
      ) : null}
      {view === "failed" ? <CardLoadError onRetry={query.refetch} isRetrying={query.isFetching} /> : null}
      {view === "empty" ? <CardNotice icon={TaskDone02Icon} title={t("dashboard.queueClear")} /> : null}
      {view === "ready" ? (
        <ul className="divide-y divide-border/50">
          {flags.map((flag) => (
            <FlagCardRow key={flag.id} flag={flag} ctx={ctx} />
          ))}
        </ul>
      ) : null}
    </DashboardCard>
  );
}
