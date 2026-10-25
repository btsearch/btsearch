import { DatabaseIcon, SmartPhone01Icon } from "@hugeicons/core-free-icons";
import type { SettingsFeatures } from "@openbts/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useSettingsSave } from "../../hooks/useSettingsSave";
import { type SwitchedFeature, toFeatureUpdate } from "../../utils/settingsUpdate";
import { FeatureSwitchRow } from "../features/featureSwitchRow";
import { ConfirmDialog } from "@/features/settings/components/confirmDialog";
import { SettingsCard, SettingsCardNote } from "@/features/settings/components/settingsPrimitives";
import { countriesQueryOptions } from "@/features/shared/lookups";

function CountriesNote() {
  const { t } = useTranslation(["admin", "nav"]);
  const { data: countries } = useQuery(countriesQueryOptions());

  if (countries === undefined) return null;

  const measured = countries.filter((country) => country.tools.includes("measurements"));
  const publicCount = measured.filter((country) => country.features.observationsPublic).length;

  return (
    <SettingsCardNote className="mt-auto">
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1">{t("settings.measurements.countriesNote", { count: measured.length, public: publicCount })}</span>
        <Link
          to="/admin/countries"
          className="shrink-0 rounded-sm font-medium text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {t("nav:items.countries")}
        </Link>
      </div>
    </SettingsCardNote>
  );
}

export function MeasurementSwitchesCard({ features }: { features: SettingsFeatures }) {
  const { t } = useTranslation("admin");
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const save = useSettingsSave();

  function changeFeature(feature: SwitchedFeature, isEnabled: boolean) {
    save.mutate(toFeatureUpdate(feature, isEnabled));
  }

  function changeObservations(isEnabled: boolean) {
    if (isEnabled) changeFeature("observations", true);
    else setIsConfirmOpen(true);
  }

  function disableObservations() {
    if (!isConfirmOpen) return;

    setIsConfirmOpen(false);
    changeFeature("observations", false);
  }

  return (
    <SettingsCard>
      <FeatureSwitchRow
        icon={SmartPhone01Icon}
        title={t("settings.features.measurementUploads.title")}
        description={t("settings.features.measurementUploads.description")}
        isEnabled={features.measurementUploads}
        onEnabledChange={(isEnabled) => changeFeature("measurementUploads", isEnabled)}
      />
      <FeatureSwitchRow
        icon={DatabaseIcon}
        title={t("settings.features.observations.title")}
        description={t("settings.features.observations.description")}
        isEnabled={features.observations}
        onEnabledChange={changeObservations}
      />
      <CountriesNote />
      <ConfirmDialog
        open={isConfirmOpen}
        onOpenChange={setIsConfirmOpen}
        title={t("settings.features.observations.confirm.title")}
        description={t("settings.features.observations.confirm.description")}
        confirmLabel={t("settings.features.observations.confirm.action")}
        onConfirm={disableObservations}
      />
    </SettingsCard>
  );
}
