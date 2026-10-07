import { useTranslation } from "react-i18next";

import type { AdminUser } from "../../types";
import { ActivityContributionCard } from "./activityContributionCard";
import { HistoryCard } from "./historyCard";
import { USER_DETAIL_TWO_COLUMN_CLASS } from "./userDetailPrimitives";
import { USER_DETAIL_SECTION_IDS } from "./userDetailSections";
import { SettingsSection } from "@/features/settings/components/settingsPrimitives";

export function ActivitySection({ user }: { user: AdminUser }) {
  const { t } = useTranslation("admin");

  return (
    <SettingsSection id={USER_DETAIL_SECTION_IDS.activity} title={t("users.detail.activity.title")}>
      <div className={USER_DETAIL_TWO_COLUMN_CLASS}>
        <ActivityContributionCard user={user} />
        <HistoryCard user={user} />
      </div>
    </SettingsSection>
  );
}
