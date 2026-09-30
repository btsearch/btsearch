import { useTranslation } from "react-i18next";

import { SETTINGS_SECTION_IDS } from "../sections";
import { ApiKeysCard } from "./apiKeysCard";
import type { SettingsUser } from "./identityBanner";
import { AuthorizedAppsCard, OAuthAppsCard } from "./oauthCards";
import { SettingsSection, SettingsStack } from "./settingsPrimitives";

export function AppsSection({ user }: { user: SettingsUser }) {
  const { t } = useTranslation("settings");

  return (
    <SettingsSection id={SETTINGS_SECTION_IDS.apps} title={t("sections.apps")}>
      <SettingsStack>
        <ApiKeysCard userId={user.id} />
        <div className="grid gap-4 @4xl:grid-cols-2">
          <AuthorizedAppsCard userId={user.id} />
          <OAuthAppsCard userId={user.id} />
        </div>
      </SettingsStack>
    </SettingsSection>
  );
}
