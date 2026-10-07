import { useTranslation } from "react-i18next";

import type { AdminUser } from "../../types";
import { AccountDataCard } from "./accountDataCard";
import { AccountDetailsCard } from "./accountDetailsCard";
import { AccountEmailCard } from "./accountEmailCard";
import { USER_DETAIL_TWO_COLUMN_CLASS } from "./userDetailPrimitives";
import { USER_DETAIL_SECTION_IDS } from "./userDetailSections";
import { SettingsSection, SettingsStack } from "@/features/settings/components/settingsPrimitives";

export function AccountSection({ user }: { user: AdminUser }) {
  const { t } = useTranslation("admin");

  return (
    <SettingsSection id={USER_DETAIL_SECTION_IDS.account} title={t("common:labels.account")}>
      <div className={USER_DETAIL_TWO_COLUMN_CLASS}>
        <AccountDataCard user={user} />
        <SettingsStack>
          <AccountEmailCard user={user} />
          <AccountDetailsCard user={user} className="flex-1" />
        </SettingsStack>
      </div>
    </SettingsSection>
  );
}
