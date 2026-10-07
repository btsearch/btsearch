import { Globe02Icon } from "@hugeicons/core-free-icons";
import type { JSX } from "react";
import { useTranslation } from "react-i18next";

import { ListFacetCombobox } from "@/features/stations/list/components/panel/listFacetCombobox";
import { listCountryOptionGroups } from "@/features/stations/list/components/panel/listPanelSections";

type SubmissionCountryFilterProps = {
  countryCodes: string[];
  options: readonly string[];
  onChange: (countryCodes: string[]) => void;
  isInline?: boolean;
};

export function SubmissionCountryFilter({ countryCodes, options, onChange, isInline = false }: SubmissionCountryFilterProps): JSX.Element {
  const { t, i18n } = useTranslation(["main", "admin"]);
  const groups = listCountryOptionGroups(options, i18n.language);

  return (
    <div>
      <ListFacetCombobox
        groups={groups}
        pickedKeys={countryCodes}
        icon={Globe02Icon}
        label={t("main:filters.country")}
        placeholder={t("admin:auditLogs.filters.allCountries")}
        emptyText={t("admin:reference.countries.addDialog.noMatches")}
        hasChips
        showPickedNames={isInline}
        isInline={isInline}
        onChange={onChange}
      />
    </div>
  );
}
