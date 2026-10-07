import { ArrowDown01Icon, ArrowUpRight01Icon, Message01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Brand, Comment, Operator, UserCommentSummary } from "@openbts/shared/contract";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

import { PROFILE_COMMENT_PAGE_SIZE, isUserCommentsUnavailable, userCommentsQueryOptions } from "../queries";
import { PROFILE_SECTION_IDS } from "./profileSections";
import { type BrandLook, BrandMark } from "@/components/cellular/brandMark";
import { Button } from "@/components/ui/button";
import { ClampedText } from "@/components/ui/clamped-text";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { InlineError, StaleDataNotice } from "@/components/ui/error-state";
import { RelativeTime } from "@/components/ui/relative-time";
import { Skeleton } from "@/components/ui/skeleton";
import { useFloatingDialogStack } from "@/features/floating-dialogs/components/floatingDialogStackProvider";
import { SettingsCard, SettingsCardFooter, SettingsRow, SettingsSection } from "@/features/settings/components/settingsPrimitives";
import { brandsQueryOptions, operatorsQueryOptions } from "@/features/shared/lookups";
import { getOperatorBrand } from "@/features/station-details/station/utils/brands";
import { useIsMobile } from "@/hooks/useMobile";

const ALL_OPERATORS = "all";
const FILTER_BUTTON_CLASS =
  "inline-flex h-full min-w-0 cursor-pointer items-center gap-1.5 rounded-md border border-transparent px-2.5 text-[0.8125rem] font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm data-[active=true]:bg-background data-[active=true]:text-foreground data-[active=true]:shadow-sm data-popup-open:text-foreground dark:aria-pressed:border-input dark:aria-pressed:bg-input/30 dark:data-[active=true]:border-input dark:data-[active=true]:bg-input/30";

type OperatorOption = { key: string; name: string; brand: BrandLook | null; count: number };

function getOperatorOptions(summary: UserCommentSummary, operators: Map<number, Operator>, brands: readonly Brand[] | undefined): OperatorOption[] {
  const options: OperatorOption[] = [];
  for (const { operatorId, count } of summary.operatorCounts) {
    const operator = operatorId === null ? undefined : operators.get(operatorId);
    if (operator === undefined) continue;
    options.push({ key: String(operator.id), name: operator.name, brand: getOperatorBrand(operator, brands), count });
  }
  return options.sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
}

function FilterCount({ count }: { count: number }) {
  return <span className="text-[0.6875rem] text-muted-foreground tabular-nums">{count}</span>;
}

function OperatorFilter({
  options,
  total,
  value,
  onValueChange,
}: {
  options: OperatorOption[];
  total: number;
  value: string;
  onValueChange: (value: string) => void;
}) {
  const { t } = useTranslation("main");
  const isMobile = useIsMobile();
  const visibleLimit = isMobile ? 2 : 4;
  const visible = options.slice(0, visibleLimit);
  const overflow = options.slice(visibleLimit);
  const selectedOverflow = overflow.find((option) => option.key === value);

  return (
    <div className="px-4 py-3 sm:px-5">
      <div
        role="group"
        aria-label={t("userProfile.comments.filterLabel")}
        className="inline-flex h-8 max-w-full items-center gap-0.5 rounded-lg bg-muted p-0.75"
      >
        <button type="button" aria-pressed={value === ALL_OPERATORS} className={FILTER_BUTTON_CLASS} onClick={() => onValueChange(ALL_OPERATORS)}>
          {t("common:status.all")}
          <FilterCount count={total} />
        </button>
        {visible.map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={value === option.key}
            className={FILTER_BUTTON_CLASS}
            onClick={() => onValueChange(option.key)}
          >
            <BrandMark brand={option.brand} />
            {option.name}
            <FilterCount count={option.count} />
          </button>
        ))}
        {overflow.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger render={<button type="button" data-active={selectedOverflow !== undefined} className={FILTER_BUTTON_CLASS} />}>
              {selectedOverflow ? (
                <>
                  <BrandMark brand={selectedOverflow.brand} />
                  {selectedOverflow.name}
                  <FilterCount count={selectedOverflow.count} />
                </>
              ) : (
                <>
                  {t("userProfile.comments.more")}
                  <FilterCount count={overflow.length} />
                </>
              )}
              <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5 text-muted-foreground" aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-52">
              <DropdownMenuRadioGroup value={value} onValueChange={onValueChange}>
                {overflow.map((option) => (
                  <DropdownMenuRadioItem key={option.key} value={option.key}>
                    <BrandMark brand={option.brand} />
                    <span className="min-w-0 flex-1 truncate">{option.name}</span>
                    <FilterCount count={option.count} />
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </div>
  );
}

function CommentRow({
  comment,
  operator,
  brand,
  fullDate,
}: {
  comment: Comment;
  operator: Operator | null;
  brand: BrandLook | null;
  fullDate: string;
}) {
  const { t } = useTranslation("main");
  const { openStationDialog } = useFloatingDialogStack();
  const { station } = comment;
  const stationId = station?.siteId ?? String(comment.stationId);
  const stationLabel = operator ? `${operator.name} ${stationId}` : stationId;
  const city = station?.location?.city;

  return (
    <article className="border-t px-4 py-3.5 first:border-t-0 sm:px-5 sm:py-4">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <button
          type="button"
          aria-label={t("userProfile.comments.openStation", { station: stationLabel })}
          className="inline-flex h-6.5 max-w-full cursor-pointer items-center gap-1.5 rounded-lg border bg-background pr-2 pl-1.5 text-xs font-medium transition-colors outline-none hover:border-foreground/20 hover:bg-muted/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          onClick={() => openStationDialog(comment.stationId, "internal")}
        >
          {operator ? (
            <>
              <BrandMark brand={brand} />
              <span className="truncate">{operator.name}</span>
            </>
          ) : null}
          <span className="font-semibold tabular-nums">{stationId}</span>
          <HugeiconsIcon icon={ArrowUpRight01Icon} className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
        {city ? <span className="text-[0.8125rem] leading-4.5 text-muted-foreground">{city}</span> : null}
        <time dateTime={comment.createdAt} title={fullDate} className="ml-auto text-xs whitespace-nowrap text-muted-foreground">
          <RelativeTime date={comment.createdAt} />
        </time>
      </div>
      <ClampedText
        text={comment.content}
        lines={3}
        className="mt-2.5 text-sm leading-5.5 text-foreground/90"
        toggleClassName="mt-1 text-[0.8125rem]"
      />
    </article>
  );
}

export function ProfileComments({ username, viewerId, summary }: { username: string; viewerId: string | null; summary: UserCommentSummary }) {
  const { t, i18n } = useTranslation("main");
  const { t: tCommon } = useTranslation("common");
  const [{ filter, visibleCount }, setPagination] = useState({ filter: ALL_OPERATORS, visibleCount: PROFILE_COMMENT_PAGE_SIZE });
  const operatorId = filter === ALL_OPERATORS ? null : Number(filter);
  const { data: operators = [] } = useQuery(operatorsQueryOptions({ viewerId }));
  const { data: brands } = useQuery(brandsQueryOptions());
  const { data, error, isPending, isFetching, isRefetchError, isFetchNextPageError, isFetchingNextPage, hasNextPage, fetchNextPage, refetch } =
    useInfiniteQuery(userCommentsQueryOptions(username, viewerId, operatorId));
  if (isUserCommentsUnavailable(error)) return null;

  const operatorsById = new Map(operators.map((operator) => [operator.id, operator]));
  const operatorOptions = getOperatorOptions(summary, operatorsById, brands);
  const comments = data?.pages.flatMap((page) => page.data) ?? [];
  const selectedCount = operatorId === null ? summary.total : (summary.operatorCounts.find((entry) => entry.operatorId === operatorId)?.count ?? 0);
  const totalCount = data?.pages[0]?.paging.total ?? selectedCount;
  const shown = Math.min(visibleCount, comments.length);
  const hasMore = comments.length > visibleCount || hasNextPage;
  const dateFormatter = new Intl.DateTimeFormat(i18n.language, { dateStyle: "long", timeStyle: "short" });

  const changeFilter = (next: string) => {
    setPagination({ filter: next, visibleCount: PROFILE_COMMENT_PAGE_SIZE });
  };

  const loadMore = async () => {
    const nextCount = visibleCount + PROFILE_COMMENT_PAGE_SIZE;
    if (comments.length < nextCount && hasNextPage) {
      const result = await fetchNextPage();
      if (result.isError) return;
    }
    setPagination((current) => (current.filter === filter ? { ...current, visibleCount: nextCount } : current));
  };

  let rows: ReactNode;
  if (isPending)
    rows = (
      <div aria-busy="true" className="space-y-3 px-4 py-3.5 sm:px-5 sm:py-4">
        <Skeleton className="h-6 w-2/5" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  else if (data === undefined && error) rows = <InlineError className="m-3" onRetry={() => void refetch()} isRetrying={isFetching} />;
  else if (comments.length === 0)
    rows = <SettingsRow icon={Message01Icon} title={tCommon("empty.comments")} description={t("userProfile.comments.emptyDescription")} />;
  else
    rows = comments.slice(0, visibleCount).map((comment) => {
      const operator = operatorsById.get(comment.station?.operatorId ?? 0) ?? null;
      return (
        <CommentRow
          key={comment.id}
          comment={comment}
          operator={operator}
          brand={getOperatorBrand(operator, brands)}
          fullDate={dateFormatter.format(new Date(comment.createdAt))}
        />
      );
    });

  return (
    <SettingsSection
      id={PROFILE_SECTION_IDS.comments}
      title={tCommon("labels.comments")}
      badge={
        summary.total > 0 ? (
          <span className="inline-flex h-4.5 items-center rounded-md bg-muted px-1.5 text-[0.6875rem] font-semibold text-muted-foreground tabular-nums">
            {summary.total}
          </span>
        ) : null
      }
    >
      <SettingsCard>
        {operatorOptions.length > 1 ? (
          <OperatorFilter options={operatorOptions} total={summary.total} value={filter} onValueChange={changeFilter} />
        ) : null}
        {isRefetchError ? <StaleDataNotice className="m-3" onRetry={() => void refetch()} isRetrying={isFetching} /> : null}
        {rows}
        {isFetchNextPageError ? <InlineError className="m-3" onRetry={loadMore} isRetrying={isFetchingNextPage} /> : null}
        {data !== undefined && hasMore ? (
          <SettingsCardFooter>
            <p className="text-[0.8125rem] text-muted-foreground">{tCommon("pagination.showing", { shown, total: totalCount })}</p>
            <Button type="button" variant="outline" size="sm" className="cursor-pointer" disabled={isFetching} onClick={() => void loadMore()}>
              {t("userProfile.comments.loadMore")}
            </Button>
          </SettingsCardFooter>
        ) : null}
        {comments.length > 0 ? (
          <p role="status" className="sr-only">
            {tCommon("pagination.showing", { shown, total: totalCount })}
          </p>
        ) : null}
      </SettingsCard>
    </SettingsSection>
  );
}
