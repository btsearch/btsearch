import { useTranslation } from "react-i18next";

import type { Country } from "../../types";
import { REFERENCE_TWO_COLUMN_CLASS, ReferenceSection } from "../shared/referenceSection";
import { COUNTRY_SECTION_IDS } from "./countrySections";
import { NetworksOperatorsCard } from "./networksOperatorsCard";
import { NetworksOwnersCard } from "./networksOwnersCard";

type NetworksSectionProps = {
  country: Country;
  canEdit: boolean;
};

export function NetworksSection({ country, canEdit }: NetworksSectionProps) {
  const { t } = useTranslation("admin");

  return (
    <ReferenceSection id={COUNTRY_SECTION_IDS.networks} title={t("reference.country.networks.title")}>
      <div className={REFERENCE_TWO_COLUMN_CLASS}>
        <NetworksOperatorsCard country={country} canEdit={canEdit} />
        <NetworksOwnersCard country={country} canEdit={canEdit} />
      </div>
    </ReferenceSection>
  );
}
