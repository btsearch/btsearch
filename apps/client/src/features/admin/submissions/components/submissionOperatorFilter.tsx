import { FullSignalIcon } from "@hugeicons/core-free-icons";
import type { JSX } from "react";
import { useTranslation } from "react-i18next";

import { BrandMark } from "@/components/cellular/brandMark";
import { CountryCodeTile } from "@/components/ui/countryCodeTile";
import type { SubmissionFilterScope } from "@/features/admin/submissions/submissionFilterScope";
import { type FacetOptionGroup, ListFacetCombobox } from "@/features/stations/list/components/panel/listFacetCombobox";
import { getCountryName } from "@/lib/geo/countryName";

type SubmissionOperatorFilterProps = {
  operatorIds: number[];
  scope: SubmissionFilterScope;
  onChange: (operatorIds: number[]) => void;
  isInline?: boolean;
};

export function SubmissionOperatorFilter({ operatorIds, scope, onChange, isInline = false }: SubmissionOperatorFilterProps): JSX.Element {
  const { t, i18n } = useTranslation("common");
  const operatorGroups = scope.countries.inPlay.flatMap((countryCode) => {
    const group = scope.lookups?.operatorGroups.get(countryCode);
    return group === undefined || group.main.length + group.minor.length === 0 ? [] : [group];
  });
  const hasCountryHeadings = operatorGroups.length > 1;
  const groups: FacetOptionGroup<number>[] = operatorGroups.map((group) => ({
    key: group.countryCode,
    heading: hasCountryHeadings ? (
      <>
        <CountryCodeTile code={group.countryCode} size="xs" />
        <span className="truncate">{getCountryName(group.countryCode, i18n.language)}</span>
      </>
    ) : null,
    separatorBefore: hasCountryHeadings,
    options: [...group.main, ...group.minor].map((entry, index) => ({
      key: entry.operator.id,
      name: entry.operator.name,
      mark: <BrandMark brand={entry.brand} size={16} />,
      separatorBefore: group.main.length > 0 && index === group.main.length,
    })),
  }));

  return (
    <div>
      <ListFacetCombobox
        groups={groups}
        pickedKeys={operatorIds}
        icon={FullSignalIcon}
        label={t("labels.operator")}
        placeholder={t("labels.allOperators")}
        emptyText={t("placeholder.noOperatorsFound")}
        hasChips
        showPickedNames={isInline}
        isInline={isInline}
        onChange={onChange}
      />
    </div>
  );
}
