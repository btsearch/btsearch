import { ArrowRight01Icon, Undo02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { AuditOperation } from "@openbts/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { recentOperationsQueryOptions } from "../queries";
import {
  CardLoadError,
  CardLoading,
  CardNotice,
  CardStaleNotice,
  CountryName,
  DashboardCard,
  type DashboardLayout,
  ROW_CONTENT_CLASS,
  ROW_LINK_CLASS,
  getCardView,
  hasStaleRows,
  limitRows,
} from "./dashboardCard";
import { BrandMark } from "@/components/cellular/brandMark";
import { RelativeTime } from "@/components/ui/relative-time";
import { Skeleton } from "@/components/ui/skeleton";
import { OperationKindBadge } from "@/features/admin/audit-operations/components/operationKindBadge";
import { getKindLabel } from "@/features/admin/audit-operations/labels";
import { type MapLookups, getOperatorLook } from "@/features/map/data/mapLookups";
import { UserLink } from "@/features/user-profile/components/userLink";
import { cn } from "@/lib/utils";

type AuditCardProps = {
  layout: DashboardLayout;
  lookups: MapLookups | undefined;
  className?: string;
};

type OperationRowProps = {
  operation: AuditOperation;
  lookups: MapLookups | undefined;
};

type OperationTargetProps = {
  operation: AuditOperation;
  lookups: MapLookups | undefined;
};

const STACK_ROW_LIMIT = 5;
const SKELETON_ROW_COUNT = 5;
const TARGET_BRAND_MARK_SIZE = 14;
const NO_OPERATIONS: AuditOperation[] = [];

const ROW_GRID_CLASS = cn(ROW_CONTENT_CLASS, "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1 px-4 py-2");
const TITLE_LINK_CLASS = cn(
  "inline-flex cursor-pointer items-center gap-1 rounded-sm underline-offset-2",
  "outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50",
);
const MUTED_TARGET_CLASS = "shrink-0 text-muted-foreground tabular-nums";

function OperationTarget({ operation, lookups }: OperationTargetProps) {
  const { t } = useTranslation(["admin", "common"]);
  const { stationIds, countryCode } = operation;
  const onlyStation = stationIds.length === 1 ? operation.stations?.[0] : undefined;

  if (onlyStation !== undefined) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <BrandMark brand={getOperatorLook(lookups, onlyStation.operatorId).brand} size={TARGET_BRAND_MARK_SIZE} />
        <span className="min-w-0 truncate font-mono font-medium tabular-nums">{onlyStation.siteId}</span>
      </span>
    );
  }
  if (stationIds.length > 1) return <span className={MUTED_TARGET_CLASS}>{t("common:labels.stations", { count: stationIds.length })}</span>;
  if (countryCode !== null) return <CountryName countryCode={countryCode} />;
  return <span className={MUTED_TARGET_CLASS}>{t("dashboard.changes", { count: operation.entryCount })}</span>;
}

function OperationRow({ operation, lookups }: OperationRowProps) {
  const { t } = useTranslation(["common", "admin", "stationDetails"]);
  const { actor } = operation;
  const systemLabel = t("admin:auditLogs.actor.system");
  const actorLabel = actor?.name ?? actor?.username ?? systemLabel;

  return (
    <li className="relative transition-colors hover:bg-muted/50">
      <Link
        to="/admin/audit-logs"
        search={{ operation: operation.id }}
        className={ROW_LINK_CLASS}
        aria-label={t("admin:dashboard.openOperation", { label: `${getKindLabel(t, operation.kind)}, ${actorLabel}` })}
      />
      <div className={ROW_GRID_CLASS}>
        <div className="flex min-w-0 items-center gap-1.5">
          <OperationKindBadge kind={operation.kind} t={t} compact className="min-w-0 shrink" />
          {operation.revertedByOperationId === null ? null : (
            <span className="inline-flex shrink-0 items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              <HugeiconsIcon icon={Undo02Icon} className="size-3" aria-hidden="true" />
              {t("stationDetails:history.revert.reverted")}
            </span>
          )}
        </div>
        <time dateTime={operation.createdAt} className="justify-self-end text-xs whitespace-nowrap text-muted-foreground tabular-nums">
          <RelativeTime date={operation.createdAt} />
        </time>
        <div className="col-span-2 flex min-w-0 items-center gap-1.5 text-xs">
          {actor === null ? (
            <span className="shrink-0 text-muted-foreground italic">{systemLabel}</span>
          ) : (
            <UserLink user={actor} className="min-w-0 truncate font-medium">
              {actorLabel}
            </UserLink>
          )}
          <span aria-hidden="true" className="shrink-0 text-muted-foreground">
            ·
          </span>
          <OperationTarget operation={operation} lookups={lookups} />
        </div>
      </div>
    </li>
  );
}

function OperationRowSkeleton() {
  return (
    <div className={ROW_GRID_CLASS} aria-hidden="true">
      <Skeleton className="h-5 w-28" />
      <Skeleton className="h-3 w-16 justify-self-end" />
      <Skeleton className="col-span-2 h-3 w-[70%]" />
    </div>
  );
}

export function AuditCard({ layout, lookups, className }: AuditCardProps) {
  const { t } = useTranslation(["admin", "nav", "common"]);
  const query = useQuery(recentOperationsQueryOptions());
  const operations = query.data?.data ?? NO_OPERATIONS;
  const view = getCardView(query, operations.length);
  const shownOperations = limitRows(operations, layout, STACK_ROW_LIMIT);
  const title = t("nav:items.auditLogs");

  return (
    <DashboardCard
      title={title}
      isFilling={layout === "columns"}
      isBusy={view === "loading"}
      className={className}
      heading={
        <Link to="/admin/audit-logs" className={TITLE_LINK_CLASS}>
          {title}
          <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5 text-muted-foreground" aria-hidden="true" />
        </Link>
      }
      notice={view === "ready" && hasStaleRows(query) ? <CardStaleNotice onRetry={query.refetch} isRetrying={query.isFetching} /> : null}
    >
      {view === "loading" ? (
        <CardLoading className="divide-y">
          {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
            <OperationRowSkeleton key={index} />
          ))}
        </CardLoading>
      ) : null}
      {view === "failed" ? <CardLoadError onRetry={query.refetch} isRetrying={query.isFetching} /> : null}
      {view === "empty" ? <CardNotice title={t("common:empty.changes")} /> : null}
      {view === "ready" ? (
        <ul className="divide-y">
          {shownOperations.map((operation) => (
            <OperationRow key={operation.id} operation={operation} lookups={lookups} />
          ))}
        </ul>
      ) : null}
    </DashboardCard>
  );
}
