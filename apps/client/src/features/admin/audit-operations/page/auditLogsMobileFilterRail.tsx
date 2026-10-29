import { Activity01Icon, Calendar03Icon, Cancel01Icon, Note01Icon, Search01Icon, UserIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { AUDIT_SEARCH_MAX_LENGTH } from "../api";
import { CountryFilterChip } from "../components/countryFilter";
import { DatePickerButton } from "../components/datePickerButton";
import { EntityFilter } from "../components/entityFilter";
import { KindFilter } from "../components/kindFilter";
import type { AuditLogsFilterProps } from "./auditLogsToolbar";
import { Button } from "@/components/ui/button";
import { CloseButton } from "@/components/ui/close-button";
import { Input } from "@/components/ui/input";
import { MobileFilterChip, MobileFilterPanelTitle } from "@/components/ui/mobile-filter-chip";
import { UserPicker } from "@/features/admin/users/picker/userPicker";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";

export function AuditLogsMobileFilterRail({
  filters,
  searchText,
  countryFilter,
  activeFilterCount,
  onFiltersChange,
  onSearchTextChange,
  onClearFilters,
}: AuditLogsFilterProps) {
  const { t } = useTranslation(["admin", "common"]);
  const hasSearchText = searchText.trim() !== "";

  return (
    <div className="flex items-center gap-1">
      <MobileFilterChip active={hasSearchText} icon={Search01Icon} label={t("auditLogs.filters.recordId")}>
        <MobileFilterPanelTitle>{t("auditLogs.filters.recordId")}</MobileFilterPanelTitle>
        <div className="relative">
          <HugeiconsIcon
            icon={Search01Icon}
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            {...NO_AUTOFILL_PROPS}
            className="h-9 w-full pl-8 pr-8"
            placeholder={t("auditLogs.filters.recordId")}
            maxLength={AUDIT_SEARCH_MAX_LENGTH}
            value={searchText}
            onChange={(event) => onSearchTextChange(event.currentTarget.value)}
          />
          {searchText ? (
            <CloseButton
              size="xs"
              label={t("common:actions.clear")}
              onClick={() => onSearchTextChange("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2"
            />
          ) : null}
        </div>
      </MobileFilterChip>

      <MobileFilterChip active={filters.entities.length > 0} count={filters.entities.length} icon={Note01Icon} label={t("auditLogs.columns.entity")}>
        <MobileFilterPanelTitle>{t("auditLogs.columns.entity")}</MobileFilterPanelTitle>
        <EntityFilter entities={filters.entities} onChange={(entities) => onFiltersChange({ entities })} isInline />
      </MobileFilterChip>

      <MobileFilterChip active={filters.kinds.length > 0} count={filters.kinds.length} icon={Activity01Icon} label={t("auditLogs.columns.kind")}>
        <MobileFilterPanelTitle>{t("auditLogs.columns.kind")}</MobileFilterPanelTitle>
        <KindFilter kinds={filters.kinds} onChange={(kinds) => onFiltersChange({ kinds })} isInline />
      </MobileFilterChip>

      <MobileFilterChip
        active={filters.userIds.length > 0}
        count={filters.userIds.length}
        icon={UserIcon}
        label={t("auditLogs.columns.actor")}
        contentClassName="gap-0 p-0"
      >
        <div className="px-2 pt-2.5">
          <MobileFilterPanelTitle>{t("auditLogs.columns.actor")}</MobileFilterPanelTitle>
        </div>
        <UserPicker selectedUserIds={filters.userIds} onSelectionChange={(userIds) => onFiltersChange({ userIds })} />
      </MobileFilterChip>

      <CountryFilterChip filter={countryFilter} onChange={(countryCodes) => onFiltersChange({ countryCodes })} />

      <MobileFilterChip
        active={filters.from !== "" || filters.to !== ""}
        count={Number(filters.from !== "") + Number(filters.to !== "")}
        icon={Calendar03Icon}
        label={t("common:labels.dateRange")}
      >
        <MobileFilterPanelTitle>{t("common:labels.dateRange")}</MobileFilterPanelTitle>
        <div className="flex flex-col gap-2">
          <DatePickerButton
            value={filters.from}
            latest={filters.to}
            onChange={(from) => onFiltersChange({ from })}
            label={t("common:labels.dateFrom")}
          />
          <DatePickerButton value={filters.to} earliest={filters.from} onChange={(to) => onFiltersChange({ to })} label={t("common:labels.dateTo")} />
        </div>
      </MobileFilterChip>

      {activeFilterCount > 0 ? (
        <Button
          variant="outline"
          size="icon"
          onClick={onClearFilters}
          className="shrink-0 cursor-pointer text-muted-foreground"
          aria-label={t("common:actions.clearAll")}
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
        </Button>
      ) : null}
    </div>
  );
}
