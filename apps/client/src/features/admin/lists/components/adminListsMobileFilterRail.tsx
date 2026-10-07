import { Globe02Icon, UserIcon } from "@hugeicons/core-free-icons";
import { useTranslation } from "react-i18next";

import { ADMIN_LISTS_SEARCH_MAX_LENGTH } from "../listsSearch";
import { type AdminListsFilterProps, useVisibilityOptions } from "./adminListsFilters";
import { MobileFilterChip, MobileFilterPanelTitle } from "@/components/ui/mobile-filter-chip";
import { MobileClearFiltersButton, MobileSearchChip } from "@/features/admin/reference/components/shared/recordListPrimitives";
import { UserPicker } from "@/features/admin/users/picker/userPicker";
import { SegmentedControl } from "@/features/settings/components/settingsPrimitives";

export function AdminListsMobileFilterRail({
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
  const visibilityOptions = useVisibilityOptions();
  const visibilityLabel = t("admin:lists.table.visibility");
  const ownerLabel = t("admin:lists.owner");

  return (
    <div role="group" aria-label={t("common:labels.filters")} className="flex items-center gap-1.5">
      <MobileSearchChip
        value={searchText}
        onChange={onSearchTextChange}
        placeholder={t("admin:lists.searchPlaceholder")}
        maxLength={ADMIN_LISTS_SEARCH_MAX_LENGTH}
      />

      <MobileFilterChip active={visibility !== "all"} icon={Globe02Icon} label={visibilityLabel}>
        <MobileFilterPanelTitle>{visibilityLabel}</MobileFilterPanelTitle>
        <SegmentedControl ariaLabel={visibilityLabel} value={visibility} options={visibilityOptions} onValueChange={onVisibilityChange} />
      </MobileFilterChip>

      <MobileFilterChip active={ownerIds.length > 0} count={ownerIds.length} icon={UserIcon} label={ownerLabel} contentClassName="gap-0 p-0">
        <div className="px-2 pt-2.5">
          <MobileFilterPanelTitle>{ownerLabel}</MobileFilterPanelTitle>
        </div>
        <UserPicker selectedUserIds={ownerIds} onSelectionChange={onOwnerIdsChange} />
      </MobileFilterChip>

      {activeFilterCount > 0 ? <MobileClearFiltersButton onClick={onClearFilters} /> : null}
    </div>
  );
}
