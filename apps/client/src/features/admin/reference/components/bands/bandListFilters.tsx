import { HashtagIcon, Radio01Icon } from "@hugeicons/core-free-icons";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import { BAND_GROUPS, type BandGroup, type BandGroupKey } from "../../utils/bands";
import { type FacetOption, FacetToggles } from "../shared/facetToggles";
import { MobileClearFiltersButton, MobileSearchChip } from "../shared/recordListPrimitives";
import { SegmentedControl } from "../shared/referenceCards";
import { REFERENCE_FILTER_LABEL_CLASS, SearchField } from "../shared/searchField";
import { BAND_SEARCH_MAX_LENGTH } from "./bandListCriteria";
import type { BandCodePresence } from "./bandListSearch";
import { MobileFilterChip, MobileFilterPanelTitle } from "@/components/ui/mobile-filter-chip";
import { ClearFiltersButton } from "@/features/shared/filterPanel";
import { RatGenerationLabel } from "@/features/shared/RatGenerationLabel";

export type BandListFilterProps = {
  searchText: string;
  groups: readonly BandGroupKey[];
  codePresence: BandCodePresence;
  activeFilterCount: number;
  onSearchTextChange: (text: string) => void;
  onGroupsChange: (groups: BandGroupKey[]) => void;
  onCodePresenceChange: (codePresence: BandCodePresence) => void;
  onClearFilters: () => void;
};

type CodePresenceOption = {
  value: BandCodePresence;
  label: string;
};

function toGroupOption(group: BandGroup): FacetOption<BandGroupKey> {
  if (group.generationRat === null) return { value: group.key, label: group.label };
  return { value: group.key, label: group.label, lead: <RatGenerationLabel rat={group.generationRat} /> };
}

const GROUP_OPTIONS = BAND_GROUPS.map(toGroupOption);

function useCodePresenceOptions(): CodePresenceOption[] {
  const { t } = useTranslation(["admin", "common"]);

  return [
    { value: "all", label: t("common:status.all") },
    { value: "with", label: t("admin:reference.bands.code.with") },
    { value: "without", label: t("admin:reference.bands.code.without") },
  ];
}

export function BandListToolbar({
  searchText,
  groups,
  codePresence,
  activeFilterCount,
  onSearchTextChange,
  onGroupsChange,
  onCodePresenceChange,
  onClearFilters,
}: BandListFilterProps) {
  const { t } = useTranslation(["admin", "common"]);
  const codeLabelId = useId();
  const codeOptions = useCodePresenceOptions();

  return (
    <>
      <SearchField
        value={searchText}
        onChange={onSearchTextChange}
        label={t("common:labels.search")}
        placeholder={t("admin:reference.bands.list.searchPlaceholder")}
        maxLength={BAND_SEARCH_MAX_LENGTH}
        className="w-full sm:w-72"
      />
      <FacetToggles label={t("admin:reference.bands.fields.technology")} options={GROUP_OPTIONS} selected={groups} onChange={onGroupsChange} />
      <div className="flex flex-col gap-1">
        <span id={codeLabelId} className={REFERENCE_FILTER_LABEL_CLASS}>
          {t("admin:reference.bands.fields.code")}
        </span>
        <SegmentedControl ariaLabelledBy={codeLabelId} value={codePresence} options={codeOptions} onValueChange={onCodePresenceChange} />
      </div>
      {activeFilterCount > 0 ? <ClearFiltersButton count={activeFilterCount} onClick={onClearFilters} className="mb-0.5 cursor-pointer" /> : null}
    </>
  );
}

export function BandListMobileFilters({
  searchText,
  groups,
  codePresence,
  activeFilterCount,
  onSearchTextChange,
  onGroupsChange,
  onCodePresenceChange,
  onClearFilters,
}: BandListFilterProps) {
  const { t } = useTranslation("admin");
  const codeOptions = useCodePresenceOptions();
  const technologyLabel = t("admin:reference.bands.fields.technology");
  const codeLabel = t("admin:reference.bands.fields.code");

  return (
    <>
      <MobileSearchChip
        value={searchText}
        onChange={onSearchTextChange}
        placeholder={t("admin:reference.bands.list.searchPlaceholder")}
        maxLength={BAND_SEARCH_MAX_LENGTH}
      />

      <MobileFilterChip active={groups.length > 0} count={groups.length} icon={Radio01Icon} label={technologyLabel}>
        <MobileFilterPanelTitle>{technologyLabel}</MobileFilterPanelTitle>
        <FacetToggles label={technologyLabel} options={GROUP_OPTIONS} selected={groups} onChange={onGroupsChange} layout="list" showLabel={false} />
      </MobileFilterChip>

      <MobileFilterChip active={codePresence !== "all"} count={Number(codePresence !== "all")} icon={HashtagIcon} label={codeLabel}>
        <MobileFilterPanelTitle>{codeLabel}</MobileFilterPanelTitle>
        <SegmentedControl ariaLabel={codeLabel} value={codePresence} options={codeOptions} onValueChange={onCodePresenceChange} />
      </MobileFilterChip>

      {activeFilterCount > 0 ? <MobileClearFiltersButton onClick={onClearFilters} /> : null}
    </>
  );
}
