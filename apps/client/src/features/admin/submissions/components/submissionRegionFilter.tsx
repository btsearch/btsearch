import { Location01Icon } from "@hugeicons/core-free-icons";
import type { JSX } from "react";
import { useTranslation } from "react-i18next";

import type { SubmissionFilterScope } from "@/features/admin/submissions/submissionFilterScope";
import { ListFacetCombobox } from "@/features/stations/list/components/panel/listFacetCombobox";
import { listRegionOptionGroups } from "@/features/stations/list/components/panel/listPanelSections";

type SubmissionRegionFilterProps = {
  regionIds: number[];
  scope: SubmissionFilterScope;
  onChange: (regionIds: number[]) => void;
  isInline?: boolean;
};

export function SubmissionRegionFilter({ regionIds, scope, onChange, isInline = false }: SubmissionRegionFilterProps): JSX.Element {
  const { t, i18n } = useTranslation(["common", "main"]);
  const hasCountryHeadings = scope.regionGroups.length > 1;
  const groups = listRegionOptionGroups(scope.regionGroups, i18n.language).map((group) => ({ ...group, separatorBefore: hasCountryHeadings }));

  return (
    <div>
      <ListFacetCombobox
        groups={groups}
        pickedKeys={regionIds}
        icon={Location01Icon}
        label={t("common:labels.region")}
        placeholder={t("main:filters.allRegions")}
        emptyText={t("main:filters.noRegionsFound")}
        hasChips
        showPickedNames={isInline}
        isInline={isInline}
        onChange={onChange}
      />
    </div>
  );
}
