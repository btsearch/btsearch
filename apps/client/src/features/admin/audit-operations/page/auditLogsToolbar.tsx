import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { AUDIT_SEARCH_MAX_LENGTH } from "../api";
import { CountryFilterButton } from "../components/countryFilter";
import { DatePickerButton } from "../components/datePickerButton";
import { EntityFilter } from "../components/entityFilter";
import { KindFilter } from "../components/kindFilter";
import type { CountryFilter } from "../useCountryFilter";
import type { AuditLogsFilters } from "./auditLogsSearch";
import { Input } from "@/components/ui/input";
import { UserPickerPopover } from "@/features/admin/users/picker/userPickerPopover";
import { ClearFiltersButton } from "@/features/shared/filterPanel";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";

export type AuditLogsFilterProps = {
  filters: AuditLogsFilters;
  searchText: string;
  countryFilter: CountryFilter;
  activeFilterCount: number;
  onFiltersChange: (changes: Partial<AuditLogsFilters>) => void;
  onSearchTextChange: (text: string) => void;
  onClearFilters: () => void;
};

export function AuditLogsToolbar({
  filters,
  searchText,
  countryFilter,
  activeFilterCount,
  onFiltersChange,
  onSearchTextChange,
  onClearFilters,
}: AuditLogsFilterProps) {
  const { t } = useTranslation(["admin", "common"]);

  return (
    <div className="flex shrink-0 flex-wrap items-end gap-2">
      <div className="flex w-44 flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">{t("auditLogs.columns.entity")}</span>
        <EntityFilter entities={filters.entities} onChange={(entities) => onFiltersChange({ entities })} />
      </div>

      <div className="flex w-48 flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">{t("auditLogs.columns.kind")}</span>
        <KindFilter kinds={filters.kinds} onChange={(kinds) => onFiltersChange({ kinds })} />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">{t("auditLogs.filters.recordId")}</span>
        <div className="relative">
          <HugeiconsIcon
            icon={Search01Icon}
            className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none"
          />
          <Input
            {...NO_AUTOFILL_PROPS}
            className="h-8 pl-7 w-40"
            placeholder={t("auditLogs.filters.recordId")}
            maxLength={AUDIT_SEARCH_MAX_LENGTH}
            value={searchText}
            onChange={(event) => onSearchTextChange(event.currentTarget.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">{t("auditLogs.columns.actor")}</span>
        <UserPickerPopover selectedUserIds={filters.userIds} onSelectionChange={(userIds) => onFiltersChange({ userIds })} />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">{t("common:labels.country")}</span>
        <CountryFilterButton filter={countryFilter} onChange={(countryCodes) => onFiltersChange({ countryCodes })} />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">{t("common:labels.dateFrom")}</span>
        <DatePickerButton
          value={filters.from}
          latest={filters.to}
          onChange={(from) => onFiltersChange({ from })}
          label={t("common:labels.dateFrom")}
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">{t("common:labels.dateTo")}</span>
        <DatePickerButton value={filters.to} earliest={filters.from} onChange={(to) => onFiltersChange({ to })} label={t("common:labels.dateTo")} />
      </div>

      {activeFilterCount > 0 ? <ClearFiltersButton count={activeFilterCount} onClick={onClearFilters} /> : null}
    </div>
  );
}
