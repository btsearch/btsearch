import { useTranslation } from "react-i18next";

import type { Country } from "../../types";
import { REFERENCE_TWO_COLUMN_CLASS, ReferenceSection } from "../shared/referenceSection";
import { AvailabilityCard } from "./availabilityCard";
import { COUNTRY_SECTION_IDS } from "./countrySections";
import { DefaultViewCard } from "./defaultViewCard";

type GeneralSectionProps = {
  country: Country;
  canEdit: boolean;
};

export function GeneralSection({ country, canEdit }: GeneralSectionProps) {
  const { t } = useTranslation("admin");

  return (
    <ReferenceSection id={COUNTRY_SECTION_IDS.general} title={t("reference.country.general.title")}>
      <div className={REFERENCE_TWO_COLUMN_CLASS}>
        <AvailabilityCard country={country} canEdit={canEdit} />
        <DefaultViewCard country={country} canEdit={canEdit} />
      </div>
    </ReferenceSection>
  );
}
