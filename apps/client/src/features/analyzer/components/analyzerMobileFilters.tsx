import {
  ArrowDataTransferHorizontalIcon,
  CheckmarkCircle02Icon,
  FilterIcon,
  FullSignalIcon,
  Radar01Icon,
  Sorting05Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { useTranslation } from "react-i18next";

import { DEFAULT_ANALYZER_FILTERS, clearAnalyzerFilters, countActiveAnalyzerFilters } from "../model/filters";
import { BandSection, ConfirmationSection, KindSection, OperatorSection, RatSection, ResultSection, SortSection } from "./analyzerSections";
import { useAnalyzerTexts } from "./analyzerTexts";
import type { AnalyzerPanelProps } from "./analyzerTypes";
import { MobileFilterChip } from "@/components/ui/mobile-filter-chip";
import { ListMobileFilterChip, ListMobileFilterRail, useHeldClearChip } from "@/features/stations/list/components/panel/listMobileFilterRail";

const NO_FILTERS = 0;
const ONE_FILTER = 1;
const CHIP_CONTENT_CLASS = "[&_button]:cursor-pointer";

export function AnalyzerMobileFilters(props: AnalyzerPanelProps) {
  const { t } = useTranslation("cellAnalyzer");
  const { getSortLabel } = useAnalyzerTexts();
  const { filters, panel, onFiltersChange } = props;
  const { hasResults } = panel;
  const { isClearChipShown, handleChipOpenChange } = useHeldClearChip(countActiveAnalyzerFilters(filters, hasResults) > 0);

  return (
    <ListMobileFilterRail isClearChipShown={isClearChipShown} onClearFilters={() => onFiltersChange(clearAnalyzerFilters)}>
      <ListMobileFilterChip
        icon={CheckmarkCircle02Icon}
        label={t("panel.result")}
        count={hasResults ? filters.statuses.length : NO_FILTERS}
        onOpenChange={handleChipOpenChange}
      >
        <ResultSection {...props} />
      </ListMobileFilterChip>
      <ListMobileFilterChip
        icon={ArrowDataTransferHorizontalIcon}
        label={t("diff.title")}
        count={hasResults ? filters.kinds.length : NO_FILTERS}
        onOpenChange={handleChipOpenChange}
      >
        <KindSection {...props} />
      </ListMobileFilterChip>
      <ListMobileFilterChip icon={FullSignalIcon} label={t("nsg:filters.technology")} count={filters.rats.length} onOpenChange={handleChipOpenChange}>
        <RatSection {...props} />
      </ListMobileFilterChip>
      <ListMobileFilterChip
        icon={FilterIcon}
        label={t("common:labels.operator")}
        count={filters.operatorIds.length}
        onOpenChange={handleChipOpenChange}
      >
        <OperatorSection {...props} />
      </ListMobileFilterChip>
      <ListMobileFilterChip icon={Radar01Icon} label={t("common:labels.band")} count={filters.bandKeys.length} onOpenChange={handleChipOpenChange}>
        <BandSection {...props} />
      </ListMobileFilterChip>
      <ListMobileFilterChip
        icon={Tick02Icon}
        label={t("panel.confirmation")}
        count={hasResults && filters.isUnconfirmedOnly ? ONE_FILTER : NO_FILTERS}
        onOpenChange={handleChipOpenChange}
      >
        <ConfirmationSection {...props} />
      </ListMobileFilterChip>
      <MobileFilterChip
        active={filters.sort !== DEFAULT_ANALYZER_FILTERS.sort}
        icon={Sorting05Icon}
        label={getSortLabel(filters.sort)}
        contentClassName={CHIP_CONTENT_CLASS}
        onOpenChange={handleChipOpenChange}
      >
        <SortSection {...props} />
      </MobileFilterChip>
    </ListMobileFilterRail>
  );
}
