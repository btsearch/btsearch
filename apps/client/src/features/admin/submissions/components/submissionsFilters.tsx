import { Cancel01Icon, FullSignalIcon, Globe02Icon, Location01Icon, Search01Icon, Tag01Icon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MobileFilterChip, MobileFilterPanelTitle } from "@/components/ui/mobile-filter-chip";
import { QueueSwitch } from "@/components/ui/queue-switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toV1SubmissionStatus, toV1SubmissionType } from "@/features/admin/submissions/api";
import { SubmissionCountryFilter } from "@/features/admin/submissions/components/submissionCountryFilter";
import { SubmissionOperatorFilter } from "@/features/admin/submissions/components/submissionOperatorFilter";
import { SubmissionRegionFilter } from "@/features/admin/submissions/components/submissionRegionFilter";
import type { SubmissionFilterScope } from "@/features/admin/submissions/submissionFilterScope";
import type { SubmissionStatusFilter, SubmissionTypeFilter } from "@/features/admin/submissions/types";
import { UserPicker } from "@/features/admin/users/picker/userPicker";
import { UserPickerPopover } from "@/features/admin/users/picker/userPickerPopover";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";
import { cn } from "@/lib/utils";

const STATUS_FILTERS: SubmissionStatusFilter[] = ["all", "pending", "accepted", "rejected"];
const TYPE_FILTERS: SubmissionTypeFilter[] = ["all", "create", "update", "delete"];

type SharedFilterProps = {
  statusFilter: SubmissionStatusFilter;
  typeFilter: SubmissionTypeFilter;
  selectedSubmitterIds: string[];
  countryCodes: string[];
  operatorIds: number[];
  regionIds: number[];
  scope: SubmissionFilterScope;
  searchInput: string;
  activeFilterCount: number;
  onStatusChange: (status: SubmissionStatusFilter) => void;
  onTypeChange: (type: SubmissionTypeFilter) => void;
  onSubmitterChange: (ids: string[]) => void;
  onCountryChange: (countryCodes: string[]) => void;
  onOperatorChange: (operatorIds: number[]) => void;
  onRegionChange: (regionIds: number[]) => void;
  onSearchChange: (value: string) => void;
  onClearAll: () => void;
};

function statusLabel(filter: SubmissionStatusFilter, t: TFunction) {
  if (filter === "all") return t("common:status.all");
  const status = toV1SubmissionStatus(filter);
  return t(`common:status.${status}`);
}

function typeLabel(filter: SubmissionTypeFilter, t: TFunction) {
  if (filter === "all") return t("common:submissionType.all");
  const type = toV1SubmissionType(filter);
  return t(`common:submissionType.${type}`);
}

export function SubmissionsStatusQueue({ value, onChange }: { value: SubmissionStatusFilter; onChange: (value: SubmissionStatusFilter) => void }) {
  const { t } = useTranslation(["submissions", "common", "main"]);
  const options = STATUS_FILTERS.map((status) => ({ value: status, label: statusLabel(status, t) }));

  return <QueueSwitch label={t("table.statusQueue")} value={value} options={options} onChange={onChange} className="hidden md:flex" />;
}

export function SubmissionsFilterToolbar({
  typeFilter,
  selectedSubmitterIds,
  countryCodes,
  operatorIds,
  regionIds,
  scope,
  searchInput,
  activeFilterCount,
  onTypeChange,
  onSubmitterChange,
  onCountryChange,
  onOperatorChange,
  onRegionChange,
  onSearchChange,
  onClearAll,
}: Omit<SharedFilterProps, "statusFilter" | "onStatusChange">) {
  const { t } = useTranslation(["submissions", "common"]);

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
            {...NO_AUTOFILL_PROPS}
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
        <span className="text-xs font-medium text-muted-foreground">{t("main:filters.country")}</span>
        <SubmissionCountryFilter countryCodes={countryCodes} options={scope.countries.options} onChange={onCountryChange} />
      </div>
      <div className="flex w-44 flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">{t("common:labels.operator")}</span>
        <SubmissionOperatorFilter operatorIds={operatorIds} scope={scope} onChange={onOperatorChange} />
      </div>

      <div className="flex w-48 flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">{t("common:labels.region")}</span>
        <SubmissionRegionFilter regionIds={regionIds} scope={scope} onChange={onRegionChange} />
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
  countryCodes,
  operatorIds,
  regionIds,
  scope,
  searchInput,
  activeFilterCount,
  onStatusChange,
  onTypeChange,
  onSubmitterChange,
  onCountryChange,
  onOperatorChange,
  onRegionChange,
  onSearchChange,
  onClearAll,
}: SharedFilterProps) {
  const { t } = useTranslation(["submissions", "common", "main"]);
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
            {...NO_AUTOFILL_PROPS}
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

      <MobileFilterChip active={countryCodes.length > 0} count={countryCodes.length} icon={Globe02Icon} label={t("main:filters.country")}>
        <MobileFilterPanelTitle>{t("main:filters.country")}</MobileFilterPanelTitle>
        <SubmissionCountryFilter countryCodes={countryCodes} options={scope.countries.options} onChange={onCountryChange} isInline />
      </MobileFilterChip>
      <MobileFilterChip
        active={selectedSubmitterIds.length > 0}
        count={selectedSubmitterIds.length}
        icon={UserGroupIcon}
        label={t("detail.submitter")}
        contentClassName="gap-0 p-0"
      >
        <div className="px-2 pt-2.5">
          <MobileFilterPanelTitle>{t("detail.submitter")}</MobileFilterPanelTitle>
        </div>
        <UserPicker selectedUserIds={selectedSubmitterIds} onSelectionChange={onSubmitterChange} />
      </MobileFilterChip>

      <MobileFilterChip active={operatorIds.length > 0} count={operatorIds.length} icon={FullSignalIcon} label={t("common:labels.operator")}>
        <MobileFilterPanelTitle>{t("common:labels.operator")}</MobileFilterPanelTitle>
        <SubmissionOperatorFilter operatorIds={operatorIds} scope={scope} onChange={onOperatorChange} isInline />
      </MobileFilterChip>

      <MobileFilterChip active={regionIds.length > 0} count={regionIds.length} icon={Location01Icon} label={t("common:labels.region")}>
        <MobileFilterPanelTitle>{t("common:labels.region")}</MobileFilterPanelTitle>
        <SubmissionRegionFilter regionIds={regionIds} scope={scope} onChange={onRegionChange} isInline />
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
