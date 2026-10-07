import { LockIcon } from "@hugeicons/core-free-icons";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import type { Country, CountryFeatures } from "../../types";
import { ReferenceCard, ReferenceCardHeader, ReferenceCardNote, ReferenceRow } from "../shared/referenceCards";
import { useCountryFeatures } from "./useCountryFeatures";
import { Switch } from "@/components/ui/switch";

const FEATURES: (keyof CountryFeatures)[] = ["structureOwnerProposals", "psc", "bsic"];

type FeatureRowProps = {
  feature: keyof CountryFeatures;
  isEnabled: boolean;
  disabled: boolean;
  onEnabledChange: (isEnabled: boolean) => void;
};

function FeatureRow({ feature, isEnabled, disabled, onEnabledChange }: FeatureRowProps) {
  const { t } = useTranslation("admin");
  const titleId = useId();

  return (
    <ReferenceRow
      title={t(`reference.country.general.features.${feature}.title`)}
      titleId={titleId}
      description={t(`reference.country.general.features.${feature}.description`)}
    >
      <Switch checked={isEnabled} disabled={disabled} onCheckedChange={onEnabledChange} aria-labelledby={titleId} className="cursor-pointer" />
    </ReferenceRow>
  );
}

export function DataAndSubmissionsCard({ country, canEdit }: { country: Country; canEdit: boolean }) {
  const { t } = useTranslation("admin");
  const features = useCountryFeatures(country.code);

  return (
    <ReferenceCard>
      <ReferenceCardHeader title={t("reference.country.general.features.title")} description={t("reference.country.general.features.description")} />
      <div className="border-t">
        {FEATURES.map((feature) => (
          <FeatureRow
            key={feature}
            feature={feature}
            isEnabled={country.features[feature]}
            disabled={!canEdit || features.isPending}
            onEnabledChange={(isEnabled) => features.mutate({ feature, isEnabled })}
          />
        ))}
      </div>
      <ReferenceCardNote icon={canEdit ? undefined : LockIcon} className="mt-auto">
        {t(canEdit ? "reference.country.general.features.note" : "reference.country.general.readOnlyNote")}
      </ReferenceCardNote>
    </ReferenceCard>
  );
}
