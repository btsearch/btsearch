import { Message01Icon } from "@hugeicons/core-free-icons";
import type { SettingsFeatures } from "@openbts/shared/contract";
import { useTranslation } from "react-i18next";

import { useSettingsSave } from "../../hooks/useSettingsSave";
import { type SwitchedFeature, toFeatureUpdate } from "../../utils/settingsUpdate";
import { WARNING_TEXT_CLASS } from "../classNames";
import { FeatureSwitchRow } from "./featureSwitchRow";
import { SettingsCard, SettingsCardNote } from "@/features/settings/components/settingsPrimitives";

export function CommentsCard({ features }: { features: SettingsFeatures }) {
  const { t } = useTranslation("admin");
  const save = useSettingsSave();

  function changeFeature(feature: SwitchedFeature, isEnabled: boolean) {
    save.mutate(toFeatureUpdate(feature, isEnabled));
  }

  return (
    <SettingsCard>
      <FeatureSwitchRow
        icon={Message01Icon}
        title={t("settings.comments")}
        description={t("settings.features.comments.description")}
        isEnabled={features.comments}
        onEnabledChange={(isEnabled) => changeFeature("comments", isEnabled)}
      />
      <FeatureSwitchRow
        isNested
        title={t("settings.commentQueue")}
        description={
          features.comments ? (
            t("settings.features.commentReview.description")
          ) : (
            <span className={WARNING_TEXT_CLASS}>{t("settings.features.commentReview.waiting")}</span>
          )
        }
        isEnabled={features.commentReview}
        onEnabledChange={(isEnabled) => changeFeature("commentReview", isEnabled)}
      />
      <SettingsCardNote className="mt-auto">{t("settings.features.comments.note")}</SettingsCardNote>
    </SettingsCard>
  );
}
