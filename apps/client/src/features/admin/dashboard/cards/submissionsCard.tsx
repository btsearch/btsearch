import { TaskDone02Icon } from "@hugeicons/core-free-icons";
import type { Submission } from "@openbts/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { pendingSubmissionsQueryOptions } from "../queries";
import {
  CARD_FOOTER_LINK_CLASS,
  CardFooter,
  CardFooterLinkIcon,
  CardLoadError,
  CardLoading,
  CardNotice,
  CardStaleNotice,
  DashboardCard,
  type DashboardLayout,
  type QueueSwitch,
  ROW_CONTENT_CLASS,
  ROW_LINK_CLASS,
  SystemSettingsLink,
  getCardView,
  hasStaleRows,
  limitRows,
} from "./dashboardCard";
import { BrandMark } from "@/components/cellular/brandMark";
import { Badge } from "@/components/ui/badge";
import { CountryCodeTile } from "@/components/ui/countryCodeTile";
import { Skeleton } from "@/components/ui/skeleton";
import { toSubmissionListRow } from "@/features/admin/submissions/api";
import {
  SubmissionChangesSummary,
  SubmissionSubmitterSummary,
  SubmissionTimestamp,
} from "@/features/admin/submissions/components/submissionListParts";
import { type MapLookups, getOperatorLook } from "@/features/map/data/mapLookups";
import { getCountryName } from "@/lib/geo/countryName";
import { cn } from "@/lib/utils";

type SubmissionsCardProps = {
  layout: DashboardLayout;
  queueSwitch: QueueSwitch;
  isAdmin: boolean;
  showsCountries: boolean;
  lookups: MapLookups | undefined;
};

type SubmissionQueueRowProps = {
  submission: Submission;
  showsCountry: boolean;
  lookups: MapLookups | undefined;
};

type SubmissionPlace = {
  text: string;
  countryCode: string | null;
};

const STACK_ROW_LIMIT = 5;
const SKELETON_ROW_COUNT = 5;
const NO_SUBMISSIONS: Submission[] = [];

const ROW_GRID_CLASS = cn(
  ROW_CONTENT_CLASS,
  "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-2.5",
  "@min-[640px]:min-h-16 @min-[640px]:grid-cols-[minmax(0,1fr)_184px_196px_104px] @min-[640px]:py-2",
);
const STATION_CELL_CLASS = "col-span-2 col-start-1 row-start-1 min-w-0 @min-[640px]:col-span-1";
const TIME_CELL_CLASS = cn(
  "col-start-3 row-start-1 mt-1 self-start justify-self-end",
  "@min-[640px]:col-start-4 @min-[640px]:mt-0 @min-[640px]:self-center",
);
const CHANGES_CELL_CLASS = "col-start-1 row-start-2 min-w-0 @min-[640px]:col-start-2 @min-[640px]:row-start-1";
const SUBMITTER_CELL_CLASS = cn(
  "col-span-2 col-start-2 row-start-2 max-w-full min-w-0 justify-self-end",
  "@min-[640px]:col-span-1 @min-[640px]:col-start-3 @min-[640px]:row-start-1 @min-[640px]:justify-self-stretch",
);

function readSubmissionPlace(submission: Submission, lookups: MapLookups | undefined): SubmissionPlace | null {
  const livePlace = submission.station?.location ?? null;
  const proposedPlace = submission.changes.location;
  const city = livePlace === null ? (proposedPlace?.city ?? null) : livePlace.city;
  const regionId = livePlace === null ? proposedPlace?.regionId : livePlace.regionId;
  const region = regionId === undefined ? undefined : lookups?.regionsById.get(regionId);
  const names = [city, region?.name].filter((name) => name !== null && name !== undefined && name !== "");

  if (names.length === 0) return null;
  return { text: names.join(", "), countryCode: livePlace?.countryCode ?? region?.countryCode ?? null };
}

function SubmissionQueueRow({ submission, showsCountry, lookups }: SubmissionQueueRowProps) {
  const { t, i18n } = useTranslation(["admin", "common", "submissions"]);
  const row = toSubmissionListRow(submission);
  const { operator, brand } = getOperatorLook(lookups, row.operatorId);
  const place = readSubmissionPlace(submission, lookups);
  const siteLabel = row.siteId ?? t("common:labels.newStation");
  const rowLabel = [siteLabel, operator?.name, place?.text].filter((part) => part !== undefined).join(", ");

  return (
    <li className="relative transition-colors hover:bg-muted/50">
      <Link
        to="/admin/submissions/$id"
        params={{ id: submission.id }}
        className={ROW_LINK_CLASS}
        aria-label={t("dashboard.openSubmission", { label: rowLabel })}
      />
      <div className={ROW_GRID_CLASS}>
        <div className={STATION_CELL_CLASS}>
          <div className="flex min-h-6 min-w-0 items-center gap-2">
            {operator === null ? null : <BrandMark brand={brand} />}
            {row.siteId === null ? (
              <span className="shrink-0 text-xs text-muted-foreground italic">{siteLabel}</span>
            ) : (
              <span className="min-w-0 truncate font-mono text-sm font-medium tabular-nums">{row.siteId}</span>
            )}
            {submission.origin === "analyzer" ? (
              <Badge variant="outline" className="h-6 rounded-md px-2 text-xs font-medium text-muted-foreground">
                {t("submissions:review.origin.analyzer")}
              </Badge>
            ) : null}
          </div>
          {place === null ? null : (
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              {showsCountry && place.countryCode !== null ? (
                <CountryCodeTile code={place.countryCode} size="xs" label={getCountryName(place.countryCode, i18n.language)} />
              ) : null}
              <span className="min-w-0 truncate">{place.text}</span>
            </div>
          )}
        </div>
        <div className={CHANGES_CELL_CLASS}>
          <SubmissionChangesSummary submission={row} />
        </div>
        <div className={SUBMITTER_CELL_CLASS}>
          <SubmissionSubmitterSummary submission={row} linked />
        </div>
        <div className={TIME_CELL_CLASS}>
          <SubmissionTimestamp value={row.createdAt} />
        </div>
      </div>
    </li>
  );
}

function SubmissionRowSkeleton() {
  return (
    <div className={ROW_GRID_CLASS} aria-hidden="true">
      <div className={cn(STATION_CELL_CLASS, "flex flex-col gap-2")}>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-36" />
      </div>
      <div className={cn(CHANGES_CELL_CLASS, "flex gap-2")}>
        <Skeleton className="h-6 w-26" />
        <Skeleton className="h-6 w-13" />
      </div>
      <div className={cn(SUBMITTER_CELL_CLASS, "flex items-center gap-2")}>
        <Skeleton className="size-7 rounded-full" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3.5 w-26" />
          <Skeleton className="h-3 w-18" />
        </div>
      </div>
      <div className={TIME_CELL_CLASS}>
        <Skeleton className="h-3 w-19" />
      </div>
    </div>
  );
}

export function SubmissionsCard({ layout, queueSwitch, isAdmin, showsCountries, lookups }: SubmissionsCardProps) {
  const { t } = useTranslation(["admin", "nav"]);
  const query = useQuery({ ...pendingSubmissionsQueryOptions(), enabled: queueSwitch === "on" });
  const submissions = query.data?.data ?? NO_SUBMISSIONS;
  const total = query.data?.paging.total ?? submissions.length;
  const view = queueSwitch === "off" ? "off" : getCardView(query, submissions.length);
  const shownSubmissions = limitRows(submissions, layout, STACK_ROW_LIMIT);
  const isListed = view === "ready" || view === "empty";

  return (
    <DashboardCard
      title={t("nav:items.submissions")}
      isFilling={layout === "columns"}
      count={isListed ? total : undefined}
      isBusy={view === "loading"}
      bodyClassName="@container"
      notice={view === "ready" && hasStaleRows(query) ? <CardStaleNotice onRetry={query.refetch} isRetrying={query.isFetching} /> : null}
      footer={
        view === "ready" ? (
          <CardFooter shown={shownSubmissions.length} total={total}>
            <Link to="/admin/submissions" search={{ page: 0, q: undefined }} className={CARD_FOOTER_LINK_CLASS}>
              {t("dashboard.allSubmissions")}
              <CardFooterLinkIcon />
            </Link>
          </CardFooter>
        ) : null
      }
    >
      {view === "off" ? <CardNotice title={t("settings.submissionsDisabled")} action={isAdmin ? <SystemSettingsLink /> : undefined} /> : null}
      {view === "loading" ? (
        <CardLoading className="divide-y">
          {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
            <SubmissionRowSkeleton key={index} />
          ))}
        </CardLoading>
      ) : null}
      {view === "failed" ? <CardLoadError onRetry={query.refetch} isRetrying={query.isFetching} /> : null}
      {view === "empty" ? <CardNotice icon={TaskDone02Icon} title={t("dashboard.queueClear")} /> : null}
      {view === "ready" ? (
        <ul className="divide-y">
          {shownSubmissions.map((submission) => (
            <SubmissionQueueRow key={submission.id} submission={submission} showsCountry={showsCountries} lookups={lookups} />
          ))}
        </ul>
      ) : null}
    </DashboardCard>
  );
}
