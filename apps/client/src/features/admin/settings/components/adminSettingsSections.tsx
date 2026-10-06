import type { Settings } from "@openbts/shared/contract";
import type { RefObject } from "react";
import { useTranslation } from "react-i18next";

import { readAnnouncement } from "../utils/settingsUpdate";
import { DisabledRoutesCard } from "./access/disabledRoutesCard";
import { SignInCard } from "./access/signInCard";
import { AnnouncementCard } from "./announcement/announcementCard";
import { STRETCHED_TWO_COLUMN_CLASS } from "./classNames";
import { RejectedPhotosCard } from "./cleanup/rejectedPhotosCard";
import { CommentsCard } from "./features/commentsCard";
import { ContributionsCard } from "./features/contributionsCard";
import { SettingsSection } from "@/features/settings/components/settingsPrimitives";

type AdminSettingsSectionsProps = {
  settings: Settings;
  announcementFormRef: RefObject<HTMLFormElement | null>;
};

export function AdminSettingsSections({ settings, announcementFormRef }: AdminSettingsSectionsProps) {
  const { t } = useTranslation("admin");
  const { access, features } = settings;

  return (
    <>
      <SettingsSection id="admin-settings-access" title={t("settings.sections.access")}>
        {access === undefined ? (
          <SignInCard isSignInRequired={settings.isSignInRequired} />
        ) : (
          <div className={STRETCHED_TWO_COLUMN_CLASS}>
            <SignInCard isSignInRequired={settings.isSignInRequired} openRoutes={access.openRoutes} />
            <DisabledRoutesCard entries={access.disabledRoutes} />
          </div>
        )}
      </SettingsSection>
      <SettingsSection id="admin-settings-features" title={t("settings.sections.features")}>
        <div className={STRETCHED_TWO_COLUMN_CLASS}>
          <ContributionsCard features={features} />
          <CommentsCard features={features} />
        </div>
      </SettingsSection>
      <SettingsSection id="admin-settings-announcement" title={t("settings.announcement")}>
        <AnnouncementCard announcement={readAnnouncement(settings)} formRef={announcementFormRef} />
      </SettingsSection>
      <SettingsSection id="admin-settings-cleanup" title={t("settings.sections.cleanup")}>
        <RejectedPhotosCard />
      </SettingsSection>
    </>
  );
}
