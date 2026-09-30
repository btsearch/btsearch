import { ArrowDown01Icon, ArrowUpRight01Icon, Message01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { ProfileComment } from "../queries";
import { PROFILE_SECTION_IDS } from "./profileSections";
import { Button } from "@/components/ui/button";
import { ClampedText } from "@/components/ui/clamped-text";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useFloatingDialogStack } from "@/features/floating-dialogs/components/floatingDialogStackProvider";
import { SettingsCard, SettingsCardFooter, SettingsRow, SettingsSection } from "@/features/settings/components/settingsPrimitives";
import { OperatorMark } from "@/features/station-details/components/dialogOperatorName";
import { useIsMobile } from "@/hooks/useMobile";
import { formatRelativeTime } from "@/lib/format";

const PAGE_SIZE = 20;
const ALL_OPERATORS = "all";
const FILTER_BUTTON_CLASS =
  "inline-flex h-full min-w-0 cursor-pointer items-center gap-1.5 rounded-md border border-transparent px-2.5 text-[0.8125rem] font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm data-[active=true]:bg-background data-[active=true]:text-foreground data-[active=true]:shadow-sm data-popup-open:text-foreground dark:aria-pressed:border-input dark:aria-pressed:bg-input/30 dark:data-[active=true]:border-input dark:data-[active=true]:bg-input/30";

type OperatorOption = { key: string; name: string; mnc: number | null; count: number };

function getOperatorOptions(comments: ProfileComment[]): OperatorOption[] {
  const options = new Map<string, OperatorOption>();
  for (const { station } of comments) {
    if (station.operator === null) continue;
    const key = String(station.operator.id);
    const option = options.get(key);
    if (option) option.count += 1;
    else options.set(key, { key, name: station.operator.name, mnc: station.operator.mnc, count: 1 });
  }
  return [...options.values()].sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
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
        className="inline-flex h-8 max-w-full items-center gap-0.5 rounded-lg bg-muted p-[3px]"
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
            <OperatorMark mnc={option.mnc} compact />
            {option.name}
            <FilterCount count={option.count} />
          </button>
        ))}
        {overflow.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger render={<button type="button" data-active={selectedOverflow !== undefined} className={FILTER_BUTTON_CLASS} />}>
              {selectedOverflow ? (
                <>
                  <OperatorMark mnc={selectedOverflow.mnc} compact />
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
                    <OperatorMark mnc={option.mnc} compact />
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

function CommentRow({ comment, relativeTime, fullDate }: { comment: ProfileComment; relativeTime: string; fullDate: string }) {
  const { t } = useTranslation("main");
  const { openStationDialog } = useFloatingDialogStack();
  const { station } = comment;
  const stationId = station.station_id ?? String(station.id);
  const stationLabel = station.operator ? `${station.operator.name} ${stationId}` : stationId;

  return (
    <article className="border-t px-4 py-3.5 first:border-t-0 sm:px-5 sm:py-4">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <button
          type="button"
          aria-label={t("userProfile.comments.openStation", { station: stationLabel })}
          className="inline-flex h-6.5 max-w-full cursor-pointer items-center gap-1.5 rounded-lg border bg-background pr-2 pl-1.5 text-xs font-medium transition-colors outline-none hover:border-foreground/20 hover:bg-muted/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          onClick={() => openStationDialog(station.id, "internal")}
        >
          {station.operator ? (
            <>
              <OperatorMark mnc={station.operator.mnc} compact />
              <span className="truncate">{station.operator.name}</span>
            </>
          ) : null}
          <span className="font-semibold tabular-nums">{stationId}</span>
          <HugeiconsIcon icon={ArrowUpRight01Icon} className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
        {station.city ? <span className="text-[0.8125rem] leading-[1.125rem] text-muted-foreground">{station.city}</span> : null}
        <time dateTime={comment.createdAt} title={fullDate} className="ml-auto text-xs whitespace-nowrap text-muted-foreground">
          {relativeTime}
        </time>
      </div>
      <ClampedText
        text={comment.content}
        lines={3}
        className="mt-2.5 text-sm leading-[1.375rem] text-foreground/90"
        toggleClassName="mt-1 text-[0.8125rem]"
      />
    </article>
  );
}

export function ProfileComments({ comments, totalCount }: { comments: ProfileComment[]; totalCount: number }) {
  const { t, i18n } = useTranslation("main");
  const { t: tCommon } = useTranslation("common");
  const [filter, setFilter] = useState(ALL_OPERATORS);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const operatorOptions = getOperatorOptions(comments);
  const filtered =
    filter === ALL_OPERATORS
      ? comments
      : comments.filter((comment) => comment.station.operator !== null && String(comment.station.operator.id) === filter);
  const dateFormatter = new Intl.DateTimeFormat(i18n.language, { dateStyle: "long", timeStyle: "short" });

  const changeFilter = (next: string) => {
    setFilter(next);
    setVisibleCount(PAGE_SIZE);
  };

  return (
    <SettingsSection
      id={PROFILE_SECTION_IDS.comments}
      title={tCommon("labels.comments")}
      badge={
        totalCount > 0 ? (
          <span className="inline-flex h-4.5 items-center rounded-md bg-muted px-1.5 text-[0.6875rem] font-semibold text-muted-foreground tabular-nums">
            {totalCount}
          </span>
        ) : null
      }
    >
      <SettingsCard>
        {operatorOptions.length > 1 ? (
          <OperatorFilter options={operatorOptions} total={comments.length} value={filter} onValueChange={changeFilter} />
        ) : null}
        {comments.length === 0 ? (
          <SettingsRow icon={Message01Icon} title={tCommon("empty.comments")} description={t("userProfile.comments.emptyDescription")} />
        ) : (
          filtered
            .slice(0, visibleCount)
            .map((comment) => (
              <CommentRow
                key={comment.id}
                comment={comment}
                relativeTime={formatRelativeTime(comment.createdAt, tCommon)}
                fullDate={dateFormatter.format(new Date(comment.createdAt))}
              />
            ))
        )}
        {filtered.length > visibleCount ? (
          <SettingsCardFooter>
            <p className="text-[0.8125rem] text-muted-foreground">{tCommon("pagination.showing", { shown: visibleCount, total: filtered.length })}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="cursor-pointer"
              onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
            >
              {t("userProfile.comments.loadMore")}
            </Button>
          </SettingsCardFooter>
        ) : totalCount > comments.length ? (
          <SettingsCardFooter>
            <p className="text-[0.8125rem] text-muted-foreground">
              {t("userProfile.comments.latestOnly", { shown: comments.length, total: totalCount })}
            </p>
          </SettingsCardFooter>
        ) : null}
        {comments.length > 0 ? (
          <p role="status" className="sr-only">
            {tCommon("pagination.showing", { shown: Math.min(visibleCount, filtered.length), total: filtered.length })}
          </p>
        ) : null}
      </SettingsCard>
    </SettingsSection>
  );
}
