import { useTranslation } from "react-i18next";

import type { AdminUser } from "../../types";
import { SecuritySignInCard } from "./securitySignInCard";
import { SessionsCard } from "./sessionsCard";
import { USER_DETAIL_TWO_COLUMN_CLASS } from "./userDetailPrimitives";
import { USER_DETAIL_SECTION_IDS } from "./userDetailSections";
import { SettingsSection } from "@/features/settings/components/settingsPrimitives";

export function SecuritySection({ user, isSelf }: { user: AdminUser; isSelf: boolean }) {
  const { t } = useTranslation("admin");

  return (
    <SettingsSection id={USER_DETAIL_SECTION_IDS.security} title={t("settings:sections.security")}>
      <div className={USER_DETAIL_TWO_COLUMN_CLASS}>
        <SecuritySignInCard user={user} isSelf={isSelf} />
        <SessionsCard user={user} isSelf={isSelf} />
      </div>
    </SettingsSection>
  );
}
