import { Cancel01Icon, FilterIcon, Search01Icon, SecurityCheckIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { type UserListFilterProps, UserRoleToggles, UserSearchField, useUserStatusOptions } from "./userListFilters";
import { Button } from "@/components/ui/button";
import { MobileFilterChip, MobileFilterPanelTitle } from "@/components/ui/mobile-filter-chip";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SegmentedControl } from "@/features/settings/components/settingsPrimitives";

export function UserListMobileFilterRail({
  searchText,
  roles,
  status,
  activeFilterCount,
  onSearchTextChange,
  onRolesChange,
  onStatusChange,
  onClearFilters,
}: UserListFilterProps) {
  const { t } = useTranslation(["admin", "common"]);
  const statusOptions = useUserStatusOptions();
  const searchLabel = t("common:labels.search");
  const roleLabel = t("users.table.role");
  const statusLabel = t("common:labels.status");
  const clearLabel = t("common:actions.clearAll");

  return (
    <div role="group" aria-label={t("common:labels.filters")} className="flex items-center gap-1.5">
      <MobileFilterChip active={searchText.trim() !== ""} icon={Search01Icon} label={searchLabel}>
        <MobileFilterPanelTitle>{searchLabel}</MobileFilterPanelTitle>
        <UserSearchField value={searchText} onChange={onSearchTextChange} label={searchLabel} inputClassName="h-9" />
      </MobileFilterChip>

      <MobileFilterChip active={roles.length > 0} count={roles.length} icon={SecurityCheckIcon} label={roleLabel}>
        <MobileFilterPanelTitle>{roleLabel}</MobileFilterPanelTitle>
        <UserRoleToggles layout="list" ariaLabel={roleLabel} roles={roles} onRolesChange={onRolesChange} />
      </MobileFilterChip>

      <MobileFilterChip active={status !== "all"} icon={FilterIcon} label={statusLabel}>
        <MobileFilterPanelTitle>{statusLabel}</MobileFilterPanelTitle>
        <SegmentedControl ariaLabel={statusLabel} value={status} options={statusOptions} onValueChange={onStatusChange} />
      </MobileFilterChip>

      {activeFilterCount > 0 ? (
        <Tooltip>
          <TooltipTrigger
            aria-label={clearLabel}
            render={<Button type="button" variant="outline" size="icon" className="cursor-pointer rounded-full text-muted-foreground" />}
            onClick={onClearFilters}
          >
            <HugeiconsIcon icon={Cancel01Icon} aria-hidden="true" className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent>{clearLabel}</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}
