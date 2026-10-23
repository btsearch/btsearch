import { LockIcon } from "@hugeicons/core-free-icons";
import { useTranslation } from "react-i18next";

import type { Country, CountryFeatures } from "../../types";
import { ReferenceCard, ReferenceCardHeader, ReferenceCardNote } from "../shared/referenceCards";
import { CountrySwitchRow } from "./countrySwitchRow";
import { useCountrySwitches } from "./useCountrySwitches";

const FEATURES: (keyof CountryFeatures)[] = ["structureOwnerProposals", "psc", "bsic"];

export function DataAndSubmissionsCard({ country, canEdit }: { country: Country; canEdit: boolean }) {
  const { t } = useTranslation("admin");
  const switches = useCountrySwitches(country.code);

  return (
    <ReferenceCard>
      <ReferenceCardHeader title={t("reference.country.general.features.title")} description={t("reference.country.general.features.description")} />
      <div className="border-t">
        {FEATURES.map((feature) => (
          <CountrySwitchRow
            key={feature}
            title={t(`reference.country.general.features.${feature}.title`)}
            description={t(`reference.country.general.features.${feature}.description`)}
            isEnabled={country.features[feature]}
            disabled={!canEdit || switches.isPending}
            onEnabledChange={(isEnabled) => switches.mutate({ features: { [feature]: isEnabled } })}
          />
        ))}
      </div>
      <ReferenceCardNote icon={canEdit ? undefined : LockIcon} className="mt-auto">
        {t(canEdit ? "reference.country.general.features.note" : "reference.country.general.readOnlyNote")}
      </ReferenceCardNote>
    </ReferenceCard>
  );
}
