import { FilterIcon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { useTranslation } from "react-i18next";

import { COMMENT_SEARCH_MAX_LENGTH } from "../api";
import { type AdminCommentsFilterProps, useQueueOptions } from "./adminCommentsFilters";
import { MobileFilterChip, MobileFilterPanelTitle } from "@/components/ui/mobile-filter-chip";
import { MobileClearFiltersButton, MobileSearchChip } from "@/features/admin/reference/components/shared/recordListPrimitives";
import { UserPicker } from "@/features/admin/users/picker/userPicker";
import { cn } from "@/lib/utils";

const QUEUE_ROW_CLASS = cn(
  "flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left text-sm transition-colors",
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
);

export function AdminCommentsMobileFilterRail({
  queue,
  pendingCount,
  searchText,
  authorIds,
  activeFilterCount,
  onQueueChange,
  onSearchTextChange,
  onAuthorIdsChange,
  onClearFilters,
}: AdminCommentsFilterProps) {
  const { t } = useTranslation(["admin", "common"]);
  const queueOptions = useQueueOptions(pendingCount);
  const statusLabel = t("common:labels.status");
  const authorLabel = t("common:labels.author");

  return (
    <div role="group" aria-label={t("common:labels.filters")} className="flex items-center gap-1.5">
      <MobileSearchChip
        value={searchText}
        onChange={onSearchTextChange}
        placeholder={t("admin:comments.searchPlaceholder")}
        maxLength={COMMENT_SEARCH_MAX_LENGTH}
      />

      <MobileFilterChip active={queue !== "all"} icon={FilterIcon} label={statusLabel}>
        <MobileFilterPanelTitle>{statusLabel}</MobileFilterPanelTitle>
        <div role="radiogroup" aria-label={statusLabel} className="grid gap-1">
          {queueOptions.map((option) => {
            const isShown = option.value === queue;

            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={isShown}
                className={cn(QUEUE_ROW_CLASS, isShown ? "bg-primary/10 text-primary" : "hover:bg-muted")}
                onClick={() => onQueueChange(option.value)}
              >
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {option.count === null ? null : <span className="text-xs tabular-nums">{option.count}</span>}
              </button>
            );
          })}
        </div>
      </MobileFilterChip>

      <MobileFilterChip active={authorIds.length > 0} count={authorIds.length} icon={UserGroupIcon} label={authorLabel} contentClassName="gap-0 p-0">
        <div className="px-2 pt-2.5">
          <MobileFilterPanelTitle>{authorLabel}</MobileFilterPanelTitle>
        </div>
        <UserPicker selectedUserIds={authorIds} onSelectionChange={onAuthorIdsChange} />
      </MobileFilterChip>

      {activeFilterCount > 0 ? <MobileClearFiltersButton onClick={onClearFilters} /> : null}
    </div>
  );
}
