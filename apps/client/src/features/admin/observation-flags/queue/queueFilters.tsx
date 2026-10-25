import { FilterIcon, Flag02Icon, FullSignalIcon, Globe02Icon, Location01Icon } from "@hugeicons/core-free-icons";
import type { ObservationFlagKind } from "@openbts/shared/contract";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import { KindFilter, KindList } from "./kindFilter";
import { type FlagsQueueCriteria, QUEUE_STATUSES, STATION_SEARCH_MAX_LENGTH } from "./queueSearch";
import { MobileFilterChip, MobileFilterPanelTitle } from "@/components/ui/mobile-filter-chip";
import { QueueSwitch } from "@/components/ui/queue-switch";
import { MobileClearFiltersButton, MobileSearchChip } from "@/features/admin/reference/components/shared/recordListPrimitives";
import { REFERENCE_FILTER_LABEL_CLASS, SearchField } from "@/features/admin/reference/components/shared/searchField";
import { SubmissionCountryFilter } from "@/features/admin/submissions/components/submissionCountryFilter";
import { SubmissionOperatorFilter } from "@/features/admin/submissions/components/submissionOperatorFilter";
import { SubmissionRegionFilter } from "@/features/admin/submissions/components/submissionRegionFilter";
import { ClearFiltersButton } from "@/features/shared/filterPanel";
import type { useListPanelScope } from "@/features/stations/list/data/listPanel";
import { cn } from "@/lib/utils";

export type QueueFiltersProps = {
  criteria: FlagsQueueCriteria;
  kindCounts: Partial<Record<ObservationFlagKind, number>> | undefined;
  isAdmin: boolean;
  stationText: string;
  activeFilterCount: number;
  scope: ReturnType<typeof useListPanelScope>;
  onCriteriaChange: (changes: Partial<FlagsQueueCriteria>) => void;
  onStationTextChange: (text: string) => void;
  onClearFilters: () => void;
};

type QueueStatusSwitchProps = {
  criteria: FlagsQueueCriteria;
  openCount: number | null;
  onCriteriaChange: (changes: Partial<FlagsQueueCriteria>) => void;
};

type QueueMobileRailProps = QueueFiltersProps & {
  openCount: number | null;
};

function useStatusOptions(openCount: number | null) {
  const { t, i18n } = useTranslation("admin");
  return QUEUE_STATUSES.map((status) => ({
    value: status,
    label: t(`observationFlags.statuses.${status}`),
    count: status === "open" && openCount !== null ? openCount.toLocaleString(i18n.language) : null,
  }));
}

export function QueueStatusSwitch({ criteria, openCount, onCriteriaChange }: QueueStatusSwitchProps) {
  const { t } = useTranslation("admin");
  const options = useStatusOptions(openCount);

  return (
    <QueueSwitch
      label={t("observationFlags.statuses.label")}
      value={criteria.status}
      options={options}
      onChange={(status) => onCriteriaChange({ status, flagId: null })}
      className="shrink-0"
    />
  );
}

export function QueueToolbar({
  criteria,
  kindCounts,
  isAdmin,
  stationText,
  activeFilterCount,
  scope,
  onCriteriaChange,
  onStationTextChange,
  onClearFilters,
}: QueueFiltersProps) {
  const { t } = useTranslation(["admin", "common", "main"]);
  const kindLabelId = useId();

  return (
    <div className="flex shrink-0 flex-wrap items-end gap-2">
      <div role="group" aria-labelledby={kindLabelId} className="flex w-60 flex-col gap-1">
        <span id={kindLabelId} className={REFERENCE_FILTER_LABEL_CLASS}>
          {t("observationFlags.filters.kind")}
        </span>
        <KindFilter kinds={criteria.kinds} counts={kindCounts} isAdmin={isAdmin} onChange={(kinds) => onCriteriaChange({ kinds, flagId: null })} />
      </div>
      <div className="flex w-44 flex-col gap-1">
        <span className={REFERENCE_FILTER_LABEL_CLASS}>{t("main:filters.country")}</span>
        <SubmissionCountryFilter
          countryCodes={criteria.countryCodes}
          options={scope.countries.options}
          onChange={(countryCodes) => onCriteriaChange({ countryCodes, flagId: null })}
        />
      </div>
      <div className="flex w-48 flex-col gap-1">
        <span className={REFERENCE_FILTER_LABEL_CLASS}>{t("common:labels.region")}</span>
        <SubmissionRegionFilter
          regionIds={criteria.regionIds}
          scope={scope}
          onChange={(regionIds) => onCriteriaChange({ regionIds, flagId: null })}
        />
      </div>
      <div className="flex w-44 flex-col gap-1">
        <span className={REFERENCE_FILTER_LABEL_CLASS}>{t("common:labels.operator")}</span>
        <SubmissionOperatorFilter
          operatorIds={criteria.operatorIds}
          scope={scope}
          onChange={(operatorIds) => onCriteriaChange({ operatorIds, flagId: null })}
        />
      </div>
      <SearchField
        value={stationText}
        onChange={onStationTextChange}
        label={t("common:labels.station")}
        placeholder={t("observationFlags.filters.stationPlaceholder")}
        maxLength={STATION_SEARCH_MAX_LENGTH}
        className="w-56"
      />
      {activeFilterCount > 0 ? <ClearFiltersButton count={activeFilterCount} onClick={onClearFilters} className="mb-0.5 cursor-pointer" /> : null}
    </div>
  );
}

export function QueueMobileRail({
  criteria,
  kindCounts,
  isAdmin,
  stationText,
  activeFilterCount,
  scope,
  openCount,
  onCriteriaChange,
  onStationTextChange,
  onClearFilters,
}: QueueMobileRailProps) {
  const { t } = useTranslation(["admin", "common", "main"]);
  const statusOptions = useStatusOptions(openCount);
  const statusLabel = t("observationFlags.statuses.label");

  return (
    <div role="group" aria-label={t("common:labels.filters")} className="flex items-center gap-1.5">
      <MobileFilterChip active={criteria.status !== "open"} icon={FilterIcon} label={statusLabel}>
        <MobileFilterPanelTitle>{statusLabel}</MobileFilterPanelTitle>
        <div role="radiogroup" aria-label={statusLabel} className="grid gap-1">
          {statusOptions.map((option) => {
            const isShown = option.value === criteria.status;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={isShown}
                className={cn(
                  "flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  isShown ? "bg-primary/10 text-primary" : "hover:bg-muted",
                )}
                onClick={() => onCriteriaChange({ status: option.value, flagId: null })}
              >
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {option.count === null ? null : <span className="text-xs tabular-nums">{option.count}</span>}
              </button>
            );
          })}
        </div>
      </MobileFilterChip>
      <MobileFilterChip active={criteria.kinds.length > 0} count={criteria.kinds.length} icon={Flag02Icon} label={t("observationFlags.filters.kind")}>
        <MobileFilterPanelTitle>{t("observationFlags.filters.kind")}</MobileFilterPanelTitle>
        <div className="custom-scrollbar max-h-80 overflow-y-auto">
          <KindList kinds={criteria.kinds} counts={kindCounts} isAdmin={isAdmin} onChange={(kinds) => onCriteriaChange({ kinds, flagId: null })} />
        </div>
      </MobileFilterChip>
      <MobileFilterChip
        active={criteria.countryCodes.length > 0}
        count={criteria.countryCodes.length}
        icon={Globe02Icon}
        label={t("main:filters.country")}
      >
        <MobileFilterPanelTitle>{t("main:filters.country")}</MobileFilterPanelTitle>
        <SubmissionCountryFilter
          countryCodes={criteria.countryCodes}
          options={scope.countries.options}
          onChange={(countryCodes) => onCriteriaChange({ countryCodes, flagId: null })}
          isInline
        />
      </MobileFilterChip>
      <MobileFilterChip
        active={criteria.regionIds.length > 0}
        count={criteria.regionIds.length}
        icon={Location01Icon}
        label={t("common:labels.region")}
      >
        <MobileFilterPanelTitle>{t("common:labels.region")}</MobileFilterPanelTitle>
        <SubmissionRegionFilter
          regionIds={criteria.regionIds}
          scope={scope}
          onChange={(regionIds) => onCriteriaChange({ regionIds, flagId: null })}
          isInline
        />
      </MobileFilterChip>
      <MobileFilterChip
        active={criteria.operatorIds.length > 0}
        count={criteria.operatorIds.length}
        icon={FullSignalIcon}
        label={t("common:labels.operator")}
      >
        <MobileFilterPanelTitle>{t("common:labels.operator")}</MobileFilterPanelTitle>
        <SubmissionOperatorFilter
          operatorIds={criteria.operatorIds}
          scope={scope}
          onChange={(operatorIds) => onCriteriaChange({ operatorIds, flagId: null })}
          isInline
        />
      </MobileFilterChip>
      <MobileSearchChip
        value={stationText}
        onChange={onStationTextChange}
        placeholder={t("observationFlags.filters.stationPlaceholder")}
        maxLength={STATION_SEARCH_MAX_LENGTH}
      />
      {activeFilterCount > 0 ? <MobileClearFiltersButton onClick={onClearFilters} /> : null}
    </div>
  );
}
