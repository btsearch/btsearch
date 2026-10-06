import { useId } from "react";
import { useTranslation } from "react-i18next";

import { ADMIN_LISTS_SEARCH_MAX_LENGTH } from "../listsSearch";
import { type AdminListsFilterProps, useVisibilityOptions } from "./adminListsFilters";
import { REFERENCE_FILTER_LABEL_CLASS, SearchField } from "@/features/admin/reference/components/shared/searchField";
import { UserPickerPopover } from "@/features/admin/users/picker/userPickerPopover";
import { SegmentedControl } from "@/features/settings/components/settingsPrimitives";
import { ClearFiltersButton } from "@/features/shared/filterPanel";

export function AdminListsToolbar({
  searchText,
  visibility,
  ownerIds,
  activeFilterCount,
  onSearchTextChange,
  onVisibilityChange,
  onOwnerIdsChange,
  onClearFilters,
}: AdminListsFilterProps) {
  const { t } = useTranslation(["admin", "common"]);
  const visibilityLabelId = useId();
  const visibilityOptions = useVisibilityOptions();
  const ownerLabelId = `${visibilityLabelId}-owner`;

  return (
    <div className="flex shrink-0 flex-wrap items-end gap-x-4 gap-y-2">
      <SearchField
        value={searchText}
        onChange={onSearchTextChange}
        label={t("common:labels.search")}
        placeholder={t("admin:lists.searchPlaceholder")}
        maxLength={ADMIN_LISTS_SEARCH_MAX_LENGTH}
        className="w-80"
      />
      <div className="flex flex-col gap-1">
        <span id={visibilityLabelId} className={REFERENCE_FILTER_LABEL_CLASS}>
          {t("admin:lists.table.visibility")}
        </span>
        <SegmentedControl ariaLabelledBy={visibilityLabelId} value={visibility} options={visibilityOptions} onValueChange={onVisibilityChange} />
      </div>
      <div role="group" aria-labelledby={ownerLabelId} className="flex flex-col gap-1">
        <span id={ownerLabelId} className={REFERENCE_FILTER_LABEL_CLASS}>
          {t("admin:lists.owner")}
        </span>
        <UserPickerPopover selectedUserIds={ownerIds} onSelectionChange={onOwnerIdsChange} />
      </div>
      {activeFilterCount > 0 ? <ClearFiltersButton count={activeFilterCount} onClick={onClearFilters} className="mb-0.5 cursor-pointer" /> : null}
    </div>
  );
}
