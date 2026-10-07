import { useId } from "react";
import { useTranslation } from "react-i18next";

import { COMMENT_SEARCH_MAX_LENGTH } from "../api";
import { type AdminCommentsFilterProps, type AdminCommentsQueueProps, useQueueOptions } from "./adminCommentsFilters";
import { QueueSwitch } from "@/components/ui/queue-switch";
import { REFERENCE_FILTER_LABEL_CLASS, SearchField } from "@/features/admin/reference/components/shared/searchField";
import { UserPickerPopover } from "@/features/admin/users/picker/userPickerPopover";
import { ClearFiltersButton } from "@/features/shared/filterPanel";

export function AdminCommentsQueueSwitch({ queue, pendingCount, onQueueChange }: AdminCommentsQueueProps) {
  const { t } = useTranslation("admin");
  const options = useQueueOptions(pendingCount);

  return <QueueSwitch label={t("admin:comments.queueLabel")} value={queue} options={options} onChange={onQueueChange} className="shrink-0" />;
}

export function AdminCommentsToolbar({
  searchText,
  authorIds,
  activeFilterCount,
  onSearchTextChange,
  onAuthorIdsChange,
  onClearFilters,
}: Omit<AdminCommentsFilterProps, keyof AdminCommentsQueueProps>) {
  const { t } = useTranslation(["admin", "common"]);
  const authorLabelId = useId();

  return (
    <div className="flex shrink-0 flex-wrap items-end gap-x-4 gap-y-2">
      <SearchField
        value={searchText}
        onChange={onSearchTextChange}
        label={t("common:labels.search")}
        placeholder={t("admin:comments.searchPlaceholder")}
        maxLength={COMMENT_SEARCH_MAX_LENGTH}
        className="w-80"
      />
      <div role="group" aria-labelledby={authorLabelId} className="flex flex-col gap-1">
        <span id={authorLabelId} className={REFERENCE_FILTER_LABEL_CLASS}>
          {t("common:labels.author")}
        </span>
        <UserPickerPopover selectedUserIds={authorIds} onSelectionChange={onAuthorIdsChange} />
      </div>
      {activeFilterCount > 0 ? <ClearFiltersButton count={activeFilterCount} onClick={onClearFilters} className="mb-0.5 cursor-pointer" /> : null}
    </div>
  );
}
