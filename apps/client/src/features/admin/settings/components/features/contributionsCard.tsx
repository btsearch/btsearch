import { SentIcon, TaskDaily01Icon } from "@hugeicons/core-free-icons";
import type { SettingsFeatures } from "@openbts/shared/contract";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useSettingsSave } from "../../hooks/useSettingsSave";
import { type SwitchedFeature, toFeatureUpdate } from "../../utils/settingsUpdate";
import { WARNING_TEXT_CLASS } from "../classNames";
import { FeatureSwitchRow } from "./featureSwitchRow";
import { ConfirmDialog } from "@/features/settings/components/confirmDialog";
import { SettingsCard } from "@/features/settings/components/settingsPrimitives";

export function ContributionsCard({ features }: { features: SettingsFeatures }) {
  const { t } = useTranslation("admin");
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const save = useSettingsSave();

  function changeFeature(feature: SwitchedFeature, isEnabled: boolean) {
    save.mutate(toFeatureUpdate(feature, isEnabled));
  }

  function changeSubmissions(isEnabled: boolean) {
    if (isEnabled) changeFeature("submissions", true);
    else setIsConfirmOpen(true);
  }

  function disableSubmissions() {
    if (!isConfirmOpen) return;

    setIsConfirmOpen(false);
    changeFeature("submissions", false);
  }

  return (
    <SettingsCard>
      <FeatureSwitchRow
        icon={SentIcon}
        title={t("common:labels.submissions")}
        description={t("settings.features.submissions.description")}
        isEnabled={features.submissions}
        onEnabledChange={changeSubmissions}
      />
      <FeatureSwitchRow
        isNested
        title={t("settings.features.photoUploads.title")}
        description={
          features.submissions ? (
            t("settings.features.photoUploads.description")
          ) : (
            <span className={WARNING_TEXT_CLASS}>{t("settings.features.photoUploads.waiting")}</span>
          )
        }
        isEnabled={features.photoUploads}
        onEnabledChange={(isEnabled) => changeFeature("photoUploads", isEnabled)}
      />
      <FeatureSwitchRow
        icon={TaskDaily01Icon}
        title={t("settings.userLists")}
        description={t("settings.features.lists.description")}
        isEnabled={features.lists}
        onEnabledChange={(isEnabled) => changeFeature("lists", isEnabled)}
      />
      <ConfirmDialog
        open={isConfirmOpen}
        onOpenChange={setIsConfirmOpen}
        title={t("settings.features.submissions.confirm.title")}
        description={t("settings.features.submissions.confirm.description")}
        confirmLabel={t("settings.features.submissions.confirm.action")}
        onConfirm={disableSubmissions}
      />
    </SettingsCard>
  );
}
