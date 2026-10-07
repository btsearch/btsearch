import { useId } from "react";
import { useTranslation } from "react-i18next";

import { type UserListFilterProps, UserRoleToggles, UserSearchField, useUserStatusOptions } from "./userListFilters";
import { Label } from "@/components/ui/label";
import { REFERENCE_FILTER_LABEL_CLASS } from "@/features/admin/reference/components/shared/searchField";
import { SegmentedControl } from "@/features/settings/components/settingsPrimitives";
import { ClearFiltersButton } from "@/features/shared/filterPanel";

export function UserListToolbar({
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
  const searchId = useId();
  const roleLabelId = useId();
  const statusLabelId = useId();
  const statusOptions = useUserStatusOptions();

  return (
    <div className="flex shrink-0 flex-wrap items-end gap-x-4 gap-y-2">
      <div className="flex w-80 flex-col gap-1">
        <Label htmlFor={searchId} className={REFERENCE_FILTER_LABEL_CLASS}>
          {t("common:labels.search")}
        </Label>
        <UserSearchField id={searchId} value={searchText} onChange={onSearchTextChange} />
      </div>
      <div className="flex flex-col gap-1">
        <span id={roleLabelId} className={REFERENCE_FILTER_LABEL_CLASS}>
          {t("users.table.role")}
        </span>
        <UserRoleToggles layout="row" ariaLabelledBy={roleLabelId} roles={roles} onRolesChange={onRolesChange} />
      </div>
      <div className="flex flex-col gap-1">
        <span id={statusLabelId} className={REFERENCE_FILTER_LABEL_CLASS}>
          {t("common:labels.status")}
        </span>
        <SegmentedControl ariaLabelledBy={statusLabelId} value={status} options={statusOptions} onValueChange={onStatusChange} />
      </div>
      {activeFilterCount > 0 ? <ClearFiltersButton count={activeFilterCount} onClick={onClearFilters} className="mb-0.5 cursor-pointer" /> : null}
    </div>
  );
}
