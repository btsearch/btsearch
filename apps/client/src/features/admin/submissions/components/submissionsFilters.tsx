import { Cancel01Icon, FullSignalIcon, Location01Icon, Search01Icon, Tag01Icon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { TFunction } from "i18next";
import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { MobileFilterChip, MobileFilterPanelTitle } from "@/components/ui/mobile-filter-chip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPicker } from "@/features/admin/users/components/UserPicker";
import { UserPickerPopover } from "@/features/admin/users/components/UserPickerPopover";
import { getOperatorColor } from "@/lib/cellular/operators";
import { cn, toggleValue } from "@/lib/utils";
import type { Operator, Region } from "@/types/station";

export type SubmissionStatusFilter = "all" | "pending" | "approved" | "rejected";
export type SubmissionTypeFilter = "all" | "new" | "update" | "delete";

const STATUS_FILTERS: SubmissionStatusFilter[] = ["all", "pending", "approved", "rejected"];
const TYPE_FILTERS: SubmissionTypeFilter[] = ["all", "new", "update", "delete"];

type SharedFilterProps = {
  statusFilter: SubmissionStatusFilter;
  typeFilter: SubmissionTypeFilter;
  selectedSubmitterIds: string[];
  selectedOperators: Operator[];
  selectedRegions: Region[];
  operators: Operator[];
  regions: Region[];
  searchInput: string;
  activeFilterCount: number;
  onStatusChange: (status: SubmissionStatusFilter) => void;
  onTypeChange: (type: SubmissionTypeFilter) => void;
  onSubmitterChange: (ids: string[]) => void;
  onOperatorChange: (operators: Operator[]) => void;
  onRegionChange: (regions: Region[]) => void;
  onSearchChange: (value: string) => void;
  onClearAll: () => void;
};

function statusLabel(status: SubmissionStatusFilter, t: TFunction) {
  return status === "all" ? t("common:status.all", "All") : t(`common:status.${status}`);
}

function typeLabel(type: SubmissionTypeFilter, t: TFunction) {
  return type === "all" ? t("common:submissionType.all", "All") : t(`common:submissionType.${type}`);
}

export function SubmissionsStatusQueue({ value, onChange }: { value: SubmissionStatusFilter; onChange: (value: SubmissionStatusFilter) => void }) {
  const { t } = useTranslation(["submissions", "common"]);

  return (
    <div className="hidden items-center gap-1 md:flex" role="group" aria-label={t("table.statusQueue")}>
      {STATUS_FILTERS.map((status) => (
        <button
          key={status}
          type="button"
          aria-pressed={value === status}
          onClick={() => onChange(status)}
          className={cn(
            "h-8 rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === status ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {statusLabel(status, t)}
        </button>
      ))}
    </div>
  );
}

export function SubmissionsFilterToolbar({
  typeFilter,
  selectedSubmitterIds,
  selectedOperators,
  selectedRegions,
  operators,
  regions,
  searchInput,
  activeFilterCount,
  onTypeChange,
  onSubmitterChange,
  onOperatorChange,
  onRegionChange,
  onSearchChange,
  onClearAll,
}: Omit<SharedFilterProps, "statusFilter" | "onStatusChange">) {
  const { t } = useTranslation(["submissions", "common"]);
  const operatorChipsRef = useRef<HTMLDivElement>(null);
  const regionChipsRef = useRef<HTMLDivElement>(null);
  const visibleOperators = useMemo(() => selectedOperators.slice(0, 1), [selectedOperators]);
  const visibleRegions = useMemo(() => selectedRegions.slice(0, 1), [selectedRegions]);
  const hiddenOperatorCount = selectedOperators.length - visibleOperators.length;
  const hiddenRegionCount = selectedRegions.length - visibleRegions.length;

  return (
    <div className="hidden flex-wrap items-end gap-2 md:flex">
      <div className="flex min-w-64 max-w-96 flex-1 flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">{t("common:labels.search")}</span>
        <div className="relative">
          <HugeiconsIcon
            icon={Search01Icon}
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            className="h-8 w-full pl-8 pr-8"
            placeholder={t("table.searchPlaceholder")}
            value={searchInput}
            onChange={(event) => onSearchChange(event.currentTarget.value)}
          />
          {searchInput ? (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-1.5 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={t("common:actions.clear")}
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex w-36 flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">{t("common:labels.type")}</span>
        <Select value={typeFilter} onValueChange={(value) => value && onTypeChange(value as SubmissionTypeFilter)}>
          <SelectTrigger className="h-8 w-full">
            <SelectValue>{typeLabel(typeFilter, t)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {TYPE_FILTERS.map((type) => (
              <SelectItem key={type} value={type}>
                {typeLabel(type, t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">{t("detail.submitter")}</span>
        <UserPickerPopover selectedUserIds={selectedSubmitterIds} onSelectionChange={onSubmitterChange} />
      </div>

      <div className="flex w-44 flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">{t("common:labels.operator")}</span>
        <Combobox multiple value={selectedOperators} onValueChange={onOperatorChange} items={operators}>
          <ComboboxChips
            ref={operatorChipsRef}
            className="h-8 min-h-8 max-h-8 flex-nowrap overflow-hidden text-sm has-data-[slot=combobox-chip]:px-2.5"
          >
            <HugeiconsIcon icon={FullSignalIcon} className="pointer-events-none size-3.5 shrink-0 text-muted-foreground" />
            {visibleOperators.map((operator) => (
              <ComboboxChip key={operator.id} className="max-w-20 shrink-0">
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <span className="size-2 shrink-0 rounded-[2px]" style={{ backgroundColor: getOperatorColor(operator.mnc) }} />
                  <span className="truncate">{operator.name}</span>
                </span>
              </ComboboxChip>
            ))}
            {hiddenOperatorCount > 0 ? (
              <ComboboxChip showRemove={false} className="shrink-0 text-muted-foreground">
                +{hiddenOperatorCount}
              </ComboboxChip>
            ) : null}
            <ComboboxChipsInput
              className={selectedOperators.length === 0 ? "min-w-0" : "min-w-2 w-2 flex-none"}
              placeholder={selectedOperators.length === 0 ? t("common:labels.allOperators") : ""}
            />
          </ComboboxChips>
          <ComboboxContent anchor={operatorChipsRef}>
            <ComboboxList>
              <ComboboxEmpty>-</ComboboxEmpty>
              {operators.map((operator) => (
                <ComboboxItem key={operator.id} value={operator}>
                  <span className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: getOperatorColor(operator.mnc) }} />
                  <span className="truncate">{operator.name}</span>
                </ComboboxItem>
              ))}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </div>

      <div className="flex w-48 flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">{t("common:labels.region")}</span>
        <Combobox multiple value={selectedRegions} onValueChange={onRegionChange} items={regions}>
          <ComboboxChips
            ref={regionChipsRef}
            className="h-8 min-h-8 max-h-8 flex-nowrap overflow-hidden text-sm has-data-[slot=combobox-chip]:px-2.5"
          >
            <HugeiconsIcon icon={Location01Icon} className="pointer-events-none size-3.5 shrink-0 text-muted-foreground" />
            {visibleRegions.map((region) => (
              <ComboboxChip key={region.id} className="max-w-28 shrink-0">
                <span className="truncate">{region.name}</span>
              </ComboboxChip>
            ))}
            {hiddenRegionCount > 0 ? (
              <ComboboxChip showRemove={false} className="shrink-0 text-muted-foreground">
                +{hiddenRegionCount}
              </ComboboxChip>
            ) : null}
            <ComboboxChipsInput
              className={selectedRegions.length === 0 ? "min-w-0" : "min-w-2 w-2 flex-none"}
              placeholder={selectedRegions.length === 0 ? t("common:labels.allRegions") : ""}
            />
          </ComboboxChips>
          <ComboboxContent anchor={regionChipsRef}>
            <ComboboxList>
              <ComboboxEmpty>-</ComboboxEmpty>
              {regions.map((region) => (
                <ComboboxItem key={region.id} value={region}>
                  {region.name}
                </ComboboxItem>
              ))}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </div>

      {activeFilterCount > 0 ? (
        <div className="flex h-8 items-center gap-1.5">
          <span className="whitespace-nowrap text-xs text-muted-foreground">{t("common:labels.filtersActive", { count: activeFilterCount })}</span>
          <Button type="button" variant="ghost" size="sm" onClick={onClearAll} aria-label={t("common:actions.clearAll")}>
            <HugeiconsIcon icon={Cancel01Icon} />
            {t("common:actions.clearAll")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function SubmissionsMobileFilterRail({
  statusFilter,
  typeFilter,
  selectedSubmitterIds,
  selectedOperators,
  selectedRegions,
  operators,
  regions,
  searchInput,
  activeFilterCount,
  onStatusChange,
  onTypeChange,
  onSubmitterChange,
  onOperatorChange,
  onRegionChange,
  onSearchChange,
  onClearAll,
}: SharedFilterProps) {
  const { t } = useTranslation(["submissions", "common"]);
  const hasSearch = searchInput.trim().length > 0;

  return (
    <div className="flex w-max items-center gap-1" role="toolbar" aria-label={t("common:labels.filters")}>
      <div className="flex items-center gap-1" role="group" aria-label={t("table.statusQueue")}>
        {STATUS_FILTERS.map((status) => (
          <button
            key={status}
            type="button"
            aria-pressed={statusFilter === status}
            onClick={() => onStatusChange(status)}
            className={cn(
              "h-8 rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              statusFilter === status ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {statusLabel(status, t)}
          </button>
        ))}
      </div>

      <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden="true" />

      <MobileFilterChip active={hasSearch} icon={Search01Icon} label={t("common:labels.search")}>
        <MobileFilterPanelTitle>{t("common:labels.search")}</MobileFilterPanelTitle>
        <div className="relative">
          <HugeiconsIcon
            icon={Search01Icon}
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            className="h-9 w-full pl-8 pr-8"
            placeholder={t("table.searchPlaceholder")}
            value={searchInput}
            onChange={(event) => onSearchChange(event.currentTarget.value)}
          />
          {hasSearch ? (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-1.5 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={t("common:actions.clear")}
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
            </button>
          ) : null}
        </div>
      </MobileFilterChip>

      <MobileFilterChip active={typeFilter !== "all"} icon={Tag01Icon} label={t("common:labels.type")}>
        <MobileFilterPanelTitle>{t("common:labels.type")}</MobileFilterPanelTitle>
        <div className="grid gap-1">
          {TYPE_FILTERS.map((type) => (
            <button
              key={type}
              type="button"
              aria-pressed={typeFilter === type}
              onClick={() => onTypeChange(type)}
              className={cn(
                "h-8 rounded-md px-2 text-left text-sm transition-colors",
                typeFilter === type ? "bg-primary/10 text-primary" : "hover:bg-muted",
              )}
            >
              {typeLabel(type, t)}
            </button>
          ))}
        </div>
      </MobileFilterChip>

      <MobileFilterChip
        active={selectedSubmitterIds.length > 0}
        count={selectedSubmitterIds.length}
        icon={UserGroupIcon}
        label={t("detail.submitter")}
      >
        <MobileFilterPanelTitle>{t("detail.submitter")}</MobileFilterPanelTitle>
        <UserPicker selectedUserIds={selectedSubmitterIds} onSelectionChange={onSubmitterChange} />
      </MobileFilterChip>

      <MobileFilterChip
        active={selectedOperators.length > 0}
        count={selectedOperators.length}
        icon={FullSignalIcon}
        label={t("common:labels.operator")}
      >
        <MobileFilterPanelTitle>{t("common:labels.operator")}</MobileFilterPanelTitle>
        <div className="grid gap-1">
          {operators.map((operator) => {
            const selected = selectedOperators.some((value) => value.id === operator.id);
            return (
              <button
                key={operator.id}
                type="button"
                aria-pressed={selected}
                onClick={() => onOperatorChange(toggleValue(selectedOperators, operator))}
                className={cn(
                  "flex h-8 items-center gap-2 rounded-md px-2 text-left text-sm transition-colors",
                  selected ? "bg-primary/10 text-primary" : "hover:bg-muted",
                )}
              >
                <span className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: getOperatorColor(operator.mnc) }} />
                <span className="min-w-0 flex-1 truncate">{operator.name}</span>
              </button>
            );
          })}
        </div>
      </MobileFilterChip>

      <MobileFilterChip active={selectedRegions.length > 0} count={selectedRegions.length} icon={Location01Icon} label={t("common:labels.region")}>
        <MobileFilterPanelTitle>{t("common:labels.region")}</MobileFilterPanelTitle>
        <div className="grid max-h-64 gap-1 overflow-y-auto">
          {regions.map((region) => {
            const selected = selectedRegions.some((value) => value.id === region.id);
            return (
              <button
                key={region.id}
                type="button"
                aria-pressed={selected}
                onClick={() => onRegionChange(toggleValue(selectedRegions, region))}
                className={cn(
                  "flex h-8 items-center rounded-md px-2 text-left text-sm transition-colors",
                  selected ? "bg-primary/10 text-primary" : "hover:bg-muted",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{region.name}</span>
              </button>
            );
          })}
        </div>
      </MobileFilterChip>

      {activeFilterCount > 0 ? (
        <button
          type="button"
          onClick={onClearAll}
          className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t("common:actions.clearAll")}
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
          {t("common:actions.clearAll")}
        </button>
      ) : null}
    </div>
  );
}
