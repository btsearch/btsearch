import { ArrowDown01Icon, ArrowDown02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ContributorLeaderboard, MeasurementListing } from "@openbts/shared/contract";
import { usePrefetchQuery, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { currentMonth, toMonthStart } from "../../lib/periods";
import { leaderboardQueryOptions } from "../../queries";
import { BlockHeader, EmptyBlock } from "../card/statisticsCard";
import { MonthPickerButton } from "../controls/monthPicker";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedControl } from "@/features/settings/components/settingsPrimitives";
import { measurementListingQueryOptions, measurementSummaryQueryOptions, measurementTermsQueryOptions } from "@/features/settings/measurementQueries";
import { UserLink } from "@/features/user-profile/components/userLink";
import { useSettledSession } from "@/hooks/useSettledSession";
import { formatShortUtcDate, resolveAvatarUrl } from "@/lib/format";
import { cn } from "@/lib/utils";

type LeaderboardMode = "month" | "all";
type LeaderboardEntry = ContributorLeaderboard["entries"][number];

const VISIBLE_ROWS = 10;
const SKELETON_NAME_WIDTHS = ["w-32", "w-24", "w-38", "w-28", "w-20", "w-36"];
const ROW_GRID_CLASS =
  "-mx-2 grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-3 px-2 @lg:grid-cols-[2rem_minmax(0,1fr)_6.5rem_6rem_5.25rem]";
const NOTE_ROW_CLASS = "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b py-2.5";

function LeaderboardRow({ entry, isOwn }: { entry: LeaderboardEntry; isOwn: boolean }) {
  const { t, i18n } = useTranslation("statistics");
  const { user } = entry;
  const displayName = user.name ?? user.username ?? "";

  return (
    <div role="row" className={cn(ROW_GRID_CLASS, "h-13 border-b border-border/60 @lg:h-11", isOwn && "bg-primary/8")}>
      <span role="cell" className="text-[0.8125rem] leading-5 font-semibold tabular-nums">
        {entry.rank}
      </span>
      <span role="cell" className="flex min-w-0 items-center gap-2.5">
        <Avatar className="size-7">
          <AvatarImage src={resolveAvatarUrl(user.image)} alt="" />
          <AvatarFallback className="text-xs font-bold">{displayName.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
        <span className="flex min-w-0 flex-col">
          <span className="flex min-w-0 items-baseline gap-1.5">
            <UserLink user={user} className="min-w-0 truncate text-sm leading-5 font-semibold">
              {displayName}
            </UserLink>
            {user.name !== null && user.username !== null ? (
              <span className="hidden min-w-0 truncate text-xs text-muted-foreground @lg:inline">@{user.username}</span>
            ) : null}
            {isOwn ? (
              <span className="inline-flex h-4.5 shrink-0 items-center self-center rounded-sm bg-primary/12 px-1.5 text-[10px] leading-none font-bold text-primary">
                {t("leaderboard.you")}
              </span>
            ) : null}
          </span>
          <span className="truncate text-xs leading-4 text-muted-foreground tabular-nums @lg:hidden">
            {`${t("common:labels.cells", { count: entry.newConfirmedCells })} · ${t("common:labels.stations", { count: entry.newSites })}`}
          </span>
        </span>
      </span>
      <span role="cell" className="text-right text-sm leading-5 font-bold tabular-nums">
        {entry.newSquares.toLocaleString(i18n.language)}
      </span>
      <span role="cell" className="hidden text-right text-sm leading-5 tabular-nums @lg:block">
        {entry.newConfirmedCells.toLocaleString(i18n.language)}
      </span>
      <span role="cell" className="hidden text-right text-sm leading-5 tabular-nums @lg:block">
        {entry.newSites.toLocaleString(i18n.language)}
      </span>
    </div>
  );
}

function LeaderboardTable({ entries, userId }: { entries: readonly LeaderboardEntry[]; userId: string | null }) {
  const { t } = useTranslation("statistics");

  return (
    <div role="table" aria-label={t("leaderboard.title")}>
      <div role="row" className={cn(ROW_GRID_CLASS, "h-8 border-y text-xs font-medium text-muted-foreground")}>
        <span role="columnheader">#</span>
        <span role="columnheader">{t("leaderboard.person")}</span>
        <span role="columnheader" aria-sort="descending" className="inline-flex items-center justify-end gap-1 text-foreground">
          {t("settings:measurements.summary.squares")}
          <HugeiconsIcon icon={ArrowDown02Icon} className="size-3" aria-hidden="true" />
        </span>
        <span role="columnheader" className="hidden text-right @lg:block">
          {t("settings:measurements.summary.cells")}
        </span>
        <span role="columnheader" className="hidden text-right @lg:block">
          {t("settings:measurements.summary.sites")}
        </span>
      </div>
      {entries.map((entry) => (
        <LeaderboardRow key={entry.user.id} entry={entry} isOwn={entry.user.id === userId} />
      ))}
    </div>
  );
}

function LeaderboardSkeleton() {
  return (
    <div aria-hidden="true" className="border-t">
      {SKELETON_NAME_WIDTHS.map((width) => (
        <div key={width} className="flex h-11 items-center gap-3 border-b border-border/60">
          <Skeleton className="h-3 w-4" />
          <Skeleton className="size-7 rounded-full" />
          <Skeleton className={cn("h-3.5", width)} />
          <span className="flex-1" />
          <Skeleton className="h-3.5 w-14" />
        </div>
      ))}
    </div>
  );
}

export function OwnStandingPrefetch({ userId }: { userId: string }) {
  usePrefetchQuery(measurementTermsQueryOptions(userId));
  usePrefetchQuery(measurementListingQueryOptions(userId));
  usePrefetchQuery(measurementSummaryQueryOptions(userId));
  return null;
}

type OwnStandingProps = { listing: MeasurementListing; ownRank: number | null; isOwnRowShown: boolean; isAllTime: boolean };

function OwnStanding({ listing, ownRank, isOwnRowShown, isAllTime }: OwnStandingProps) {
  const { t } = useTranslation("statistics");
  const isProfilePrivate = listing.isListed && !listing.hasPublicProfile;

  if (!listing.isListed || isProfilePrivate) {
    return (
      <div className={NOTE_ROW_CLASS}>
        <p className="min-w-0 flex-[1_1_13.75rem] text-[0.8125rem] leading-5 text-muted-foreground">
          {t(isProfilePrivate ? "settings:measurements.leaderboard.privateProfile" : "leaderboard.notListed")}
        </p>
        <Link
          to="/settings"
          search={{ tab: isProfilePrivate ? "profile" : "measurements" }}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          {t(isProfilePrivate ? "settings:measurements.leaderboard.profileSettings" : "leaderboard.measurementSettings")}
        </Link>
      </div>
    );
  }
  if (isOwnRowShown || ownRank === null) return null;

  return (
    <p className={cn(NOTE_ROW_CLASS, "justify-start gap-x-2 text-[0.8125rem] leading-5")}>
      <span className="text-muted-foreground">{t(isAllTime ? "leaderboard.rankAllTime" : "leaderboard.rankThisMonth")}</span>
      <span className="font-bold tabular-nums">{ownRank}</span>
    </p>
  );
}

export function Leaderboard({ countryCode }: { countryCode: string }) {
  const { t, i18n } = useTranslation("statistics");
  const [mode, setMode] = useState<LeaderboardMode>("month");
  const [month, setMonth] = useState(currentMonth);
  const [isExpanded, setIsExpanded] = useState(false);
  const { data: session } = useSettledSession();
  const userId = session?.user?.id ?? null;
  const isSignedIn = userId !== null;
  const startsOn = mode === "month" ? toMonthStart(month) : null;
  const { data: board, isError, isFetching, refetch } = useQuery(leaderboardQueryOptions(countryCode, startsOn));
  const { data: terms } = useQuery({ ...measurementTermsQueryOptions(userId ?? ""), enabled: isSignedIn });
  const { data: listing } = useQuery({ ...measurementListingQueryOptions(userId ?? ""), enabled: isSignedIn });
  const { data: summary } = useQuery({ ...measurementSummaryQueryOptions(userId ?? ""), enabled: isSignedIn });
  const isContributor = terms !== undefined && terms.acceptedVersion !== null;

  const entries = board?.entries ?? [];
  const shownEntries = isExpanded ? entries : entries.slice(0, VISIBLE_ROWS);
  const isOwnRowShown = shownEntries.some((entry) => entry.user.id === userId);
  const ownRank = summary?.ranks.find((rank) => rank.countryCode === countryCode && rank.startsOn === startsOn)?.rank ?? null;
  const modeOptions = [
    { value: "month" as const, label: t("filters.month") },
    { value: "all" as const, label: t("leaderboard.allTime") },
  ];

  function changeMode(nextMode: LeaderboardMode) {
    setMode(nextMode);
    setIsExpanded(false);
  }

  function changeMonth(nextMonth: string) {
    setMonth(nextMonth);
    setIsExpanded(false);
  }

  function renderBoard() {
    if (board === undefined) {
      if (isError) return <ErrorState onRetry={() => refetch()} isRetrying={isFetching} />;
      return <LeaderboardSkeleton />;
    }
    if (entries.length === 0) {
      return (
        <div className="border-y">
          <EmptyBlock title={t(mode === "month" ? "leaderboard.emptyMonth" : "leaderboard.emptyAllTime")} />
        </div>
      );
    }
    return <LeaderboardTable entries={shownEntries} userId={userId} />;
  }

  return (
    <div className="@container">
      <BlockHeader
        title={t("leaderboard.title")}
        description={t("leaderboard.description")}
        actions={
          <>
            <SegmentedControl
              value={mode}
              options={modeOptions}
              onValueChange={changeMode}
              ariaLabel={t("leaderboard.period")}
              className="max-sm:w-auto"
            />
            {mode === "month" ? <MonthPickerButton value={month} onValueChange={changeMonth} /> : null}
          </>
        }
      />
      <div className="mt-3">{renderBoard()}</div>
      {board === undefined ? null : (
        <>
          {!isContributor || listing === undefined ? null : (
            <OwnStanding listing={listing} ownRank={ownRank} isOwnRowShown={isOwnRowShown} isAllTime={startsOn === null} />
          )}
          <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1.5 pt-1.5">
            <p className="min-w-0 flex-[1_1_15rem] text-xs leading-4 text-muted-foreground">
              {t("leaderboard.onlyListed")}
              {board === null || board.refreshedOn === null
                ? null
                : ` · ${t("leaderboard.refreshedOn", { date: formatShortUtcDate(board.refreshedOn, i18n.language) })}`}
            </p>
            {entries.length > VISIBLE_ROWS ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-expanded={isExpanded}
                className="cursor-pointer"
                onClick={() => setIsExpanded((expanded) => !expanded)}
              >
                {t(isExpanded ? "common:actions.showLess" : "common:actions.showMore")}
                <HugeiconsIcon
                  icon={ArrowDown01Icon}
                  data-icon="inline-end"
                  aria-hidden="true"
                  className={cn("transition-transform duration-150", isExpanded && "rotate-180")}
                />
              </Button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
