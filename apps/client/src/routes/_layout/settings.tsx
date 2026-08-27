import {
  Alert01Icon,
  Alert02Icon,
  CheckmarkCircle02Icon,
  ComputerIcon,
  Facebook01Icon,
  InstagramIcon,
  Key01Icon,
  Mail01Icon,
  PuzzleIcon,
  SecurityLockIcon,
  SourceCodeIcon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { ApiKeysCard } from "@/components/account/apikeysCard";
import { AuthorizedAppsCard } from "@/components/account/authorizedAppsCard";
import { AvatarCard } from "@/components/account/avatarCard";
import { OAuthAppsCard } from "@/components/account/oauthAppsCard";
import { PasswordCard } from "@/components/account/passwordCard";
import { DeleteAccount } from "@/components/auth/delete-user/delete-account";
import { Passkeys } from "@/components/auth/passkey/passkeys";
import { ChangeEmail } from "@/components/auth/settings/account/change-email";
import { UserProfile } from "@/components/auth/settings/account/user-profile";
import { ActiveSessions } from "@/components/auth/settings/security/active-sessions";
import { LinkedAccounts } from "@/components/auth/settings/security/linked-accounts";
import { TwoFactorSettings } from "@/components/auth/two-factor/two-factor-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PreferencesContent } from "@/features/account/PreferencesContent";
import { fetchRegions } from "@/features/shared/api";
import { API_BASE, fetchJson } from "@/lib/api";
import { authClient } from "@/lib/authClient";
import { cn } from "@/lib/utils";

type SettingsTab = "account" | "profile" | "security" | "preferences";
const TABS: SettingsTab[] = ["account", "profile", "security", "preferences"];

function SectionHeader({ icon, title, description }: { icon: typeof UserIcon; title: string; description?: string }) {
  return (
    <div className="flex items-start gap-3">
      <div aria-hidden="true" className="flex items-center justify-center size-9 rounded-lg bg-muted text-muted-foreground shrink-0 mt-0.5">
        <HugeiconsIcon icon={icon} className="size-4.5" />
      </div>
      <div className="min-w-0 border-l-2 border-primary/50 pl-2.5">
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground truncate">{title}</h2>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
    </div>
  );
}

function PasswordSection({ userId }: { userId: string }) {
  const { t } = useTranslation("settings");
  const qc = useQueryClient();

  const { data: passwordStatus } = useQuery({
    queryKey: ["account", "password", userId],
    queryFn: () => fetchJson<{ data: { hasPassword: boolean } }>(`${API_BASE}/account/password`).then((r) => r.data),
  });

  const { data: passkeys, isError: passkeysError } = useQuery({
    queryKey: ["passkeys", userId],
    queryFn: () => authClient.passkey.listUserPasskeys(),
    select: (r) => r.data ?? [],
  });

  const removeMutation = useMutation({
    mutationFn: () => fetchJson<void>(`${API_BASE}/account/password`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(t("security.passwordless.success"));
      void qc.invalidateQueries({ queryKey: ["account", "password", userId] });
    },
    onError: (err: Error) => toast.error(err.message || t("security.passwordless.removeError")),
  });

  const hasPassword = passwordStatus?.hasPassword ?? null;
  const hasPasskey = (passkeys?.length ?? 0) > 0;

  const passwordlessHint = passkeysError
    ? t("security.passwordless.passkeyLoadError")
    : !hasPasskey
      ? t("security.passwordless.requiresPasskey")
      : t("security.passwordless.description");

  return (
    <>
      {hasPassword !== null ? <PasswordCard userId={userId} hasPassword={hasPassword} /> : null}

      {hasPassword ? (
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium leading-none">{t("security.passwordless.title")}</p>
              <p className="text-xs text-muted-foreground mt-1.5">{passwordlessHint}</p>
            </div>
            <Button
              size="sm"
              variant="destructive"
              disabled={passkeysError || !hasPasskey || removeMutation.isPending}
              onClick={() => removeMutation.mutate()}
              className="shrink-0"
            >
              {removeMutation.isPending ? <Spinner /> : null}
              {t(removeMutation.isPending ? "security.passwordless.removing" : "security.passwordless.remove")}
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function EmailVerificationCard({ email, emailVerified }: { email: string; emailVerified: boolean }) {
  const { t } = useTranslation("settings");

  const resendMutation = useMutation({
    mutationFn: () => authClient.sendVerificationEmail({ email, callbackURL: "/settings" }),
    onSuccess: () => toast.success(t("account.emailVerification.resendSuccess")),
    onError: (err: Error) => toast.error(err.message ?? t("account.emailVerification.resendError")),
  });

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <HugeiconsIcon
            aria-hidden="true"
            icon={emailVerified ? CheckmarkCircle02Icon : Alert01Icon}
            className={emailVerified ? "size-4 text-green-500 shrink-0" : "size-4 text-amber-500 shrink-0"}
          />
          <div className="min-w-0">
            <p className="text-sm font-medium leading-none">
              {emailVerified ? t("account.emailVerification.verified") : t("account.emailVerification.unverified")}
            </p>
            {!emailVerified && <p className="text-xs text-muted-foreground mt-1.5">{t("account.emailVerification.unverifiedDescription")}</p>}
          </div>
        </div>
        {!emailVerified && (
          <Button size="sm" variant="outline" disabled={resendMutation.isPending} onClick={() => resendMutation.mutate()}>
            {resendMutation.isPending ? <Spinner /> : null}
            {t(resendMutation.isPending ? "account.emailVerification.resending" : "account.emailVerification.resend")}
          </Button>
        )}
      </div>
    </div>
  );
}

function SectionSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <Skeleton className="size-9 rounded-lg shrink-0" />
        <div className="space-y-1.5 flex-1">
          <Skeleton className="h-3.5 w-24 rounded" />
          <Skeleton className="h-3 w-40 rounded" />
        </div>
      </div>
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-18 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

type ProfileData = {
  bio: string | null;
  contactInfo: { instagram?: string; facebook?: string; email?: string } | null;
  profileVisibility: string;
  hunterListing: boolean;
  hunterRegions: number[];
};

function ProfileTab({ userId, username }: { userId: string; username: string | undefined }) {
  const { data: profileData, isLoading } = useQuery({
    queryKey: ["account", "profile", userId],
    queryFn: () => fetchJson<{ data: ProfileData }>(`${API_BASE}/account/profile`).then((r) => r.data),
  });
  const { data: regions = [], isLoading: regionsLoading } = useQuery({
    queryKey: ["regions"],
    queryFn: fetchRegions,
  });

  if (isLoading || !profileData)
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );

  return <ProfileForm key={userId} userId={userId} username={username} profileData={profileData} regions={regions} regionsLoading={regionsLoading} />;
}

function ProfileForm({
  userId,
  username,
  profileData,
  regions,
  regionsLoading,
}: {
  userId: string;
  username: string | undefined;
  profileData: ProfileData;
  regions: Awaited<ReturnType<typeof fetchRegions>>;
  regionsLoading: boolean;
}) {
  const { t } = useTranslation("settings");
  const qc = useQueryClient();
  const [bio, setBio] = useState(() => profileData.bio ?? "");
  const [instagram, setInstagram] = useState(() => profileData.contactInfo?.instagram ?? "");
  const [facebook, setFacebook] = useState(() => profileData.contactInfo?.facebook ?? "");
  const [contactEmail, setContactEmail] = useState(() => profileData.contactInfo?.email ?? "");
  const [isPublic, setIsPublic] = useState(() => profileData.profileVisibility !== "private");
  const [hunterListing, setHunterListing] = useState(() => profileData.hunterListing ?? false);
  const [hunterRegions, setHunterRegions] = useState<number[]>(() => profileData.hunterRegions ?? []);

  const toggleHunterRegion = (regionId: number) => {
    setHunterRegions((current) => (current.includes(regionId) ? current.filter((id) => id !== regionId) : [...current, regionId]));
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      fetchJson<{ data: ProfileData }>(`${API_BASE}/account/profile`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bio: bio || null,
          contactInfo: {
            instagram: instagram || undefined,
            facebook: facebook || undefined,
            email: contactEmail || undefined,
          },
          profileVisibility: isPublic !== false ? "public" : "private",
          hunterListing,
          hunterRegions,
        }),
      }),
    onSuccess: ({ data }) => {
      setBio(data.bio ?? "");
      setInstagram(data.contactInfo?.instagram ?? "");
      setFacebook(data.contactInfo?.facebook ?? "");
      setContactEmail(data.contactInfo?.email ?? "");
      setIsPublic(data.profileVisibility !== "private");
      setHunterListing(data.hunterListing ?? false);
      setHunterRegions(data.hunterRegions ?? []);
      qc.setQueryData(["account", "profile", userId], data);
      toast.success(t("profile.saveSuccess"));
    },
    onError: (err: Error) => toast.error(err.message || t("profile.saveError")),
  });

  const remaining = 500 - bio.length;
  const bioHasLink = /https?:\/\/|www\.|[a-z0-9-]+\.[a-z]{2,}/i.test(bio);
  const instagramInvalid = !!instagram && !/^[a-zA-Z0-9._]{1,30}$/.test(instagram);
  const facebookInvalid = !!facebook && !/^https:\/\/(www\.)?facebook\.com\/[a-zA-Z0-9._%+-]{1,60}\/?$/.test(facebook);
  const emailInvalid = !!contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail);
  const hasErrors = bioHasLink || instagramInvalid || facebookInvalid || emailInvalid;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="rounded-xl border bg-card p-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium leading-none">{t("profile.visibility.title")}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <p className="text-xs text-muted-foreground">{isPublic ? t("profile.visibility.public") : t("profile.visibility.private")}</p>
            {username && isPublic && (
              <Link to="/users/$username" params={{ username }} className="text-xs text-primary hover:underline">
                {t("profile.viewProfile")} →
              </Link>
            )}
          </div>
        </div>
        <Switch checked={isPublic} onCheckedChange={setIsPublic} />
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold">{t("profile.bio.label")}</p>
          <p className="text-xs text-muted-foreground">{t("profile.bio.hint")}</p>
        </div>
        <Textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={500}
          rows={4}
          placeholder={t("profile.bio.placeholder")}
          className={cn("resize-none", bioHasLink && "border-destructive focus-visible:ring-destructive")}
        />
        {bioHasLink && <p className="text-xs text-destructive">{t("profile.bio.noLinks")}</p>}
        <p className={cn("text-xs text-right", remaining < 50 ? "text-amber-500" : "text-muted-foreground")}>
          {t("profile.bio.remaining", { count: remaining })}
        </p>
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-4">
        <div className="space-y-1">
          <p className="text-sm font-semibold">{t("profile.contact.title")}</p>
          <p className="text-xs text-muted-foreground">{t("profile.contact.hint")}</p>
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <HugeiconsIcon icon={InstagramIcon} className="size-3.5" />
              {t("profile.contact.instagram")}
            </Label>
            <Input
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
              placeholder={t("profile.contact.instagramPlaceholder")}
              maxLength={30}
              className={instagramInvalid ? "border-destructive focus-visible:ring-destructive" : ""}
            />
            {instagramInvalid && <p className="text-xs text-destructive">{t("profile.contact.instagramError")}</p>}
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <HugeiconsIcon icon={Facebook01Icon} className="size-3.5" />
              {t("profile.contact.facebook")}
            </Label>
            <Input
              value={facebook}
              onChange={(e) => setFacebook(e.target.value)}
              placeholder={t("profile.contact.facebookPlaceholder")}
              maxLength={120}
              className={facebookInvalid ? "border-destructive focus-visible:ring-destructive" : ""}
            />
            {facebookInvalid && <p className="text-xs text-destructive">{t("profile.contact.facebookError")}</p>}
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <HugeiconsIcon icon={Mail01Icon} className="size-3.5" />
              {t("profile.contact.email")}
            </Label>
            <Input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder={t("profile.contact.emailPlaceholder")}
              maxLength={100}
              className={emailInvalid ? "border-destructive focus-visible:ring-destructive" : ""}
            />
            {emailInvalid && <p className="text-xs text-destructive">{t("profile.contact.emailError")}</p>}
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-none">{t("profile.hunters.title")}</p>
            <p className="text-xs text-muted-foreground mt-1.5 max-w-prose">{t("profile.hunters.description")}</p>
            <p className="text-xs text-muted-foreground mt-2">{hunterListing ? t("profile.hunters.enabled") : t("profile.hunters.disabled")}</p>
          </div>
          <Switch checked={hunterListing} onCheckedChange={setHunterListing} />
        </div>

        {hunterListing ? (
          <div className="space-y-2.5 border-t pt-3">
            <div className="space-y-1">
              <p className="text-xs font-medium text-foreground">{t("profile.hunters.regions")}</p>
              <p className="text-xs text-muted-foreground">{t("profile.hunters.regionsHint")}</p>
            </div>
            {regionsLoading ? (
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-7 w-24 rounded-full" />
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {regions.map((region) => {
                  const selected = hunterRegions.includes(region.id);
                  return (
                    <button
                      key={region.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleHunterRegion(region.id)}
                      className={cn(
                        "h-7 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        selected
                          ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                          : "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
                      )}
                    >
                      {region.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || hasErrors}>
          {saveMutation.isPending ? <Spinner /> : null}
          {t(saveMutation.isPending ? "profile.saving" : "profile.save")}
        </Button>
      </div>
    </div>
  );
}

function AccountSettingsPage() {
  const { t } = useTranslation("settings");
  const { data: session, isPending } = authClient.useSession();
  const { tab } = Route.useSearch();
  const navigate = useNavigate();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  const [indicatorReady, setIndicatorReady] = useState(false);

  const user = session?.user ?? null;
  const visibleTabs: SettingsTab[] = user ? TABS : ["preferences"];

  useLayoutEffect(() => {
    if (isPending) return;

    const tabs: SettingsTab[] = session?.user ? TABS : ["preferences"];
    const updateIndicator = () => {
      const idx = tabs.indexOf(tab);
      const el = tabRefs.current[idx];
      if (!el) return;
      setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
      setIndicatorReady(true);
    };

    updateIndicator();
    window.addEventListener("resize", updateIndicator);

    return () => {
      window.removeEventListener("resize", updateIndicator);
    };
  }, [tab, isPending, session?.user]);

  if (isPending)
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-8 max-md:pb-16">
          <div className="border-b pb-4">
            <Skeleton className="h-8 w-48 rounded" />
          </div>
          <div className="flex gap-6 border-b pb-1 -mx-6 px-6">
            {TABS.map((_, i) => (
              <Skeleton key={i} className="h-5 w-20 rounded" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SectionSkeleton rows={5} />
            <SectionSkeleton rows={3} />
          </div>
        </div>
      </div>
    );

  if (!user && tab !== "preferences") return <Navigate to="/settings" search={{ tab: "preferences" }} replace />;

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar">
      <div className="relative inline-flex border-b border-border pr-6">
        <div
          className="absolute bottom-0 h-0.5 bg-primary transition-all duration-200 ease-out"
          style={{ left: indicator.left, width: indicator.width, opacity: indicatorReady ? 1 : 0 }}
        />
        {visibleTabs.map((tabKey, i) => (
          <button
            key={tabKey}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            type="button"
            onClick={() => navigate({ to: "/settings", search: { tab: tabKey }, replace: true })}
            className={cn(
              "px-4 py-3 text-sm transition-colors",
              tab === tabKey ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`tabs.${tabKey}`)}
          </button>
        ))}
      </div>
      <div className="p-6 space-y-6 max-md:pb-16">
        {tab === "account" && user && (
          <div key="account" className="animate-in fade-in slide-in-from-bottom-1 duration-150 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="space-y-4">
              <SectionHeader icon={UserIcon} title={t("account.title")} description={t("account.description")} />
              <div className="space-y-3">
                <AvatarCard />
                <UserProfile />
                <ChangeEmail />
                <EmailVerificationCard email={user.email} emailVerified={user.emailVerified} />
                <LinkedAccounts />
              </div>
            </section>
          </div>
        )}

        {tab === "profile" && user && (
          <div key="profile" className="animate-in fade-in slide-in-from-bottom-1 duration-150">
            <ProfileTab userId={user.id} username={user.username ?? undefined} />
          </div>
        )}

        {tab === "security" && user && (
          <div key="security" className="animate-in fade-in slide-in-from-bottom-1 duration-150 space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <section className="space-y-4">
                <SectionHeader icon={SecurityLockIcon} title={t("security.title")} description={t("security.description")} />
                <div className="space-y-3">
                  <PasswordSection userId={user.id} />
                  <TwoFactorSettings />
                  <Passkeys />
                </div>
              </section>

              <section className="space-y-4">
                <SectionHeader icon={ComputerIcon} title={t("sessions.title")} description={t("sessions.description")} />
                <ActiveSessions />
              </section>
            </div>

            <section className="space-y-4">
              <SectionHeader icon={Key01Icon} title={t("apiKeys.title")} description={t("apiKeys.description")} />
              <ApiKeysCard userId={user.id} />
            </section>

            <section className="space-y-4">
              <SectionHeader icon={PuzzleIcon} title={t("oauth:authorized.title")} description={t("oauth:authorized.description")} />
              <AuthorizedAppsCard userId={user.id} />
            </section>

            <section className="space-y-4">
              <SectionHeader icon={SourceCodeIcon} title={t("oauth:apps.title")} description={t("oauth:apps.description")} />
              <OAuthAppsCard userId={user.id} />
            </section>

            <section className="space-y-4 border-t border-destructive/20 pt-8 pb-6">
              <SectionHeader icon={Alert02Icon} title={t("dangerZone.title")} description={t("dangerZone.description")} />
              <DeleteAccount />
            </section>
          </div>
        )}

        {tab === "preferences" && (
          <div key="preferences" className="animate-in fade-in slide-in-from-bottom-1 duration-150 pb-6">
            <PreferencesContent />
          </div>
        )}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_layout/settings")({
  component: AccountSettingsPage,
  validateSearch: (search: Record<string, unknown>): { tab: SettingsTab } => ({
    tab: TABS.includes(search.tab as SettingsTab) ? (search.tab as SettingsTab) : "account",
  }),
  staticData: {
    titleKey: "page.shortTitle",
    i18nNamespace: "settings",
    breadcrumbs: [{ titleKey: "account.title", i18nNamespace: "settings" }],
    mainClassName: "overflow-hidden max-md:pb-0",
  },
});
