import { Login01Icon, UserLock01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useRegisterPageSections } from "@/contexts/pageSections";
import { AccountSection } from "@/features/settings/components/accountSection";
import { AppsSection } from "@/features/settings/components/appsSection";
import { IdentityBanner, type SettingsUser } from "@/features/settings/components/identityBanner";
import { PreferencesSection } from "@/features/settings/components/preferencesSection";
import { ProfileSection } from "@/features/settings/components/profileSection";
import { SecuritySection } from "@/features/settings/components/securitySection";
import { SettingsIconTile } from "@/features/settings/components/settingsPrimitives";
import { ReauthProvider, useRequestReauth } from "@/features/settings/reauth";
import { SETTINGS_SECTION_IDS, SETTINGS_SECTION_KEYS, type SettingsSectionKey, isSettingsSectionKey } from "@/features/settings/sections";
import { useNavMode } from "@/hooks/usePreferences";
import { useSettledSession } from "@/hooks/useSettledSession";
import { cn } from "@/lib/utils";

function SettingsPageSections() {
  const { t } = useTranslation("settings");
  useRegisterPageSections(SETTINGS_SECTION_KEYS.map((key) => ({ id: SETTINGS_SECTION_IDS[key], title: t(`sections.${key}`) })));
  return null;
}

function SignedInSettings({ user, section }: { user: SettingsUser; section: SettingsSectionKey | undefined }) {
  const { i18n } = useTranslation();

  useEffect(() => {
    if (section === undefined) return;
    document.getElementById(SETTINGS_SECTION_IDS[section])?.scrollIntoView({ block: "start" });
  }, [section]);

  return (
    <>
      <div className="flex flex-col gap-10 sm:gap-12">
        <IdentityBanner user={user} />
        <AccountSection user={user} />
        <ProfileSection user={user} />
        <SecuritySection user={user} />
        <AppsSection user={user} />
        <PreferencesSection />
      </div>
      <SettingsPageSections key={i18n.language} />
    </>
  );
}

function SignedOutSettings() {
  const { t } = useTranslation("settings");
  const requestSignIn = useRequestReauth();

  return (
    <div className="flex flex-col gap-10 sm:gap-12">
      <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-border/70 bg-background bg-linear-115 from-primary/14 via-primary/6 via-34% to-transparent to-70% px-4 py-4 sm:px-6 sm:py-5">
        <SettingsIconTile icon={UserLock01Icon} className="size-10" />
        <div className="min-w-0 flex-[1_1_18rem]">
          <p className="text-base leading-6 font-semibold">{t("signedOut.title")}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("signedOut.description")}</p>
        </div>
        <Button onClick={requestSignIn}>
          <HugeiconsIcon icon={Login01Icon} data-icon="inline-start" aria-hidden="true" />
          {t("common:actions.signIn")}
        </Button>
      </section>
      <PreferencesSection />
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-10 sm:gap-12">
      <Skeleton className="h-36 w-full rounded-2xl" />
      <div className="space-y-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-56 w-full rounded-xl" />
        <div className="grid gap-4 @4xl:grid-cols-2">
          <Skeleton className="h-18 w-full rounded-xl" />
          <Skeleton className="h-18 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

function SettingsPage() {
  const { t } = useTranslation("settings");
  const { tab } = Route.useSearch();
  const { data: session, isPending } = useSettledSession();
  const navMode = useNavMode();

  return (
    <div className="@container custom-scrollbar flex-1 overflow-y-auto">
      <div className={cn("w-full px-3 pt-5 sm:px-6 sm:pt-6 lg:px-8", navMode === "floating" ? "pb-32" : "pb-10")}>
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">{t("nav:items.settings")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("page.description")}</p>
        </header>
        <ReauthProvider>
          {isPending ? <SettingsSkeleton /> : session?.user ? <SignedInSettings user={session.user} section={tab} /> : <SignedOutSettings />}
        </ReauthProvider>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_layout/settings")({
  component: SettingsPage,
  validateSearch: (search: Record<string, unknown>): { tab?: SettingsSectionKey } => (isSettingsSectionKey(search.tab) ? { tab: search.tab } : {}),
  staticData: {
    titleKey: "items.settings",
    i18nNamespace: "nav",
    mainClassName: "overflow-hidden max-md:pb-0",
  },
});
