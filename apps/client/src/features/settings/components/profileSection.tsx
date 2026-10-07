import { ArrowUpRight01Icon, Facebook01Icon, Globe02Icon, InstagramIcon, Mail01Icon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { showSettingsError } from "../authErrors";
import { type ProfileData, accountProfileQueryOptions } from "../queries";
import { SETTINGS_SECTION_IDS } from "../sections";
import type { SettingsUser } from "./identityBanner";
import {
  SETTINGS_DESCRIPTION_CLASS,
  SettingsCard,
  SettingsCardFooter,
  SettingsCardHeader,
  SettingsIconTile,
  SettingsRow,
  SettingsSection,
} from "./settingsPrimitives";
import { Button, buttonVariants } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { RegionCombobox } from "@/features/shared/filterPanel";
import { regionsQueryOptions } from "@/features/shared/lookups";
import { USER_PROFILE_QUERY_KEY } from "@/features/user-profile/queries";
import { useBeforeUnloadGuard } from "@/hooks/useBeforeUnloadGuard";
import { API_BASE, fetchJson } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Region } from "@/types/station";

const BIO_MAX_LENGTH = 500;
const HUNTER_REGIONS_MAX = 20;
const BIO_LINK_PATTERN = /https?:\/\/|www\.|[a-z0-9-]+\.[a-z]{2,}/i;
const INSTAGRAM_PATTERN = /^[a-zA-Z0-9._]{1,30}$/;
const FACEBOOK_PATTERN = /^https:\/\/(www\.)?facebook\.com\/[a-zA-Z0-9._%+-]{1,60}\/?$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ProfileDraft = {
  bio: string;
  instagram: string;
  facebook: string;
  contactEmail: string;
  isPublic: boolean;
  hunterListing: boolean;
  hunterRegions: number[];
};

function toDraft(profile: ProfileData): ProfileDraft {
  return {
    bio: profile.bio ?? "",
    instagram: profile.contactInfo?.instagram ?? "",
    facebook: profile.contactInfo?.facebook ?? "",
    contactEmail: profile.contactInfo?.email ?? "",
    isPublic: profile.profileVisibility !== "private",
    hunterListing: profile.hunterListing,
    hunterRegions: profile.hunterRegions,
  };
}

function isSameDraft(left: ProfileDraft, right: ProfileDraft): boolean {
  return (
    left.bio === right.bio &&
    left.instagram === right.instagram &&
    left.facebook === right.facebook &&
    left.contactEmail === right.contactEmail &&
    left.isPublic === right.isPublic &&
    left.hunterListing === right.hunterListing &&
    left.hunterRegions.length === right.hunterRegions.length &&
    left.hunterRegions.every((regionId) => right.hunterRegions.includes(regionId))
  );
}

function ContactField({
  icon,
  label,
  htmlFor,
  error,
  children,
}: {
  icon: IconSvgElement;
  label: string;
  htmlFor: string;
  error: string | null;
  children: ReactNode;
}) {
  return (
    <div className="px-4 py-2 last:pb-4 sm:px-5">
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
        <label htmlFor={htmlFor} className="flex min-w-0 flex-[1_1_8rem] items-center gap-2 text-sm">
          <HugeiconsIcon icon={icon} aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{label}</span>
        </label>
        <div className="min-w-0 flex-[1_1_16rem]">{children}</div>
      </div>
      {error !== null ? <p className="mt-1.5 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function ProfileCard({ user, profile, regions }: { user: SettingsUser; profile: ProfileData; regions: Region[] }) {
  const { t } = useTranslation(["settings", "common"]);
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(() => toDraft(profile));
  const [draft, setDraft] = useState(saved);
  const visibilityTitleId = useId();
  const huntersTitleId = useId();
  const bioId = useId();
  const instagramId = useId();
  const facebookId = useId();
  const emailId = useId();

  const update = (patch: Partial<ProfileDraft>) => setDraft((current) => ({ ...current, ...patch }));

  const saveMutation = useMutation({
    mutationFn: (values: ProfileDraft) =>
      fetchJson<{ data: ProfileData }>(`${API_BASE}/account/profile`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bio: values.bio.trim() || null,
          contactInfo: {
            instagram: values.instagram.trim() || undefined,
            facebook: values.facebook.trim() || undefined,
            email: values.contactEmail.trim() || undefined,
          },
          profileVisibility: values.isPublic ? "public" : "private",
          hunterListing: values.hunterListing,
          hunterRegions: values.hunterRegions,
        }),
      }),
    onSuccess: ({ data }) => {
      const next = toDraft(data);
      setSaved(next);
      setDraft(next);
      queryClient.setQueryData(accountProfileQueryOptions(user.id).queryKey, data);
      void queryClient.invalidateQueries({ queryKey: USER_PROFILE_QUERY_KEY });
      toast.success(t("profile.saveSuccess"));
    },
    onError: showSettingsError,
  });

  useBeforeUnloadGuard(!isSameDraft(draft, saved));

  const isDirty = !isSameDraft(draft, saved);
  const bioHasLink = BIO_LINK_PATTERN.test(draft.bio);
  const instagramInvalid = draft.instagram.trim() !== "" && !INSTAGRAM_PATTERN.test(draft.instagram.trim());
  const facebookInvalid = draft.facebook.trim() !== "" && !FACEBOOK_PATTERN.test(draft.facebook.trim());
  const emailInvalid = draft.contactEmail.trim() !== "" && !EMAIL_PATTERN.test(draft.contactEmail.trim());
  const regionsMissing = draft.hunterListing && draft.hunterRegions.length === 0;
  const regionsTooMany = draft.hunterRegions.length > HUNTER_REGIONS_MAX;
  const hasErrors = bioHasLink || instagramInvalid || facebookInvalid || emailInvalid || regionsMissing || regionsTooMany;
  const bioRemaining = BIO_MAX_LENGTH - draft.bio.length;

  return (
    <SettingsCard>
      <SettingsCardHeader
        title={t("sections.profile")}
        description={t("profile.description")}
        action={
          user.username ? (
            <Link to="/users/$username" params={{ username: user.username }} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              <HugeiconsIcon icon={ArrowUpRight01Icon} data-icon="inline-start" aria-hidden="true" />
              {t("profile.viewProfile")}
            </Link>
          ) : null
        }
      />
      <div className="grid border-t @3xl:grid-cols-2">
        <div className="min-w-0">
          <SettingsRow
            icon={Globe02Icon}
            title={t("profile.visibility.title")}
            titleId={visibilityTitleId}
            description={draft.isPublic ? t("profile.visibility.public") : t("profile.visibility.hint")}
          >
            <Switch
              checked={draft.isPublic}
              aria-labelledby={visibilityTitleId}
              onCheckedChange={(checked) => update(checked ? { isPublic: true } : { isPublic: false, hunterListing: false })}
            />
          </SettingsRow>
          <div className="flex flex-col gap-2.5 border-t px-4 py-3.5 sm:px-5">
            <div className="flex items-end justify-between gap-4">
              <div className="min-w-0">
                <label htmlFor={bioId} className="text-sm leading-5 font-medium">
                  {t("common:labels.aboutMe")}
                </label>
                <p className={cn("mt-0.5", SETTINGS_DESCRIPTION_CLASS)}>{t("profile.bio.hint")}</p>
              </div>
              <span
                className={cn("shrink-0 text-xs tabular-nums", bioRemaining < 50 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}
              >
                {draft.bio.length} / {BIO_MAX_LENGTH}
              </span>
            </div>
            <Textarea
              id={bioId}
              value={draft.bio}
              onChange={(event) => update({ bio: event.target.value })}
              maxLength={BIO_MAX_LENGTH}
              rows={3}
              placeholder={t("profile.bio.placeholder")}
              aria-invalid={bioHasLink || undefined}
              className="min-h-22 resize-y"
            />
            {bioHasLink ? <p className="text-xs text-destructive">{t("profile.bio.noLinks")}</p> : null}
          </div>
        </div>
        <div className="min-w-0 border-t @3xl:border-t-0 @3xl:border-l">
          <div className="px-4 pt-3.5 pb-1.5 sm:px-5">
            <p className="text-sm leading-5 font-medium">{t("profile.contact.title")}</p>
            <p className={cn("mt-0.5", SETTINGS_DESCRIPTION_CLASS)}>{t("profile.contact.hint")}</p>
          </div>
          <ContactField
            icon={InstagramIcon}
            label={t("profile.contact.instagram")}
            htmlFor={instagramId}
            error={instagramInvalid ? t("profile.contact.instagramError") : null}
          >
            <InputGroup>
              <InputGroupAddon>
                <InputGroupText>@</InputGroupText>
              </InputGroupAddon>
              <InputGroupInput
                id={instagramId}
                value={draft.instagram}
                onChange={(event) => update({ instagram: event.target.value.replace(/^@+/, "") })}
                placeholder={t("profile.contact.instagramPlaceholder")}
                maxLength={30}
                autoCapitalize="none"
                spellCheck={false}
                aria-invalid={instagramInvalid || undefined}
              />
            </InputGroup>
          </ContactField>
          <ContactField
            icon={Facebook01Icon}
            label={t("profile.contact.facebook")}
            htmlFor={facebookId}
            error={facebookInvalid ? t("profile.contact.facebookError") : null}
          >
            <Input
              id={facebookId}
              type="url"
              value={draft.facebook}
              onChange={(event) => update({ facebook: event.target.value })}
              placeholder={t("profile.contact.facebookPlaceholder")}
              maxLength={120}
              aria-invalid={facebookInvalid || undefined}
            />
          </ContactField>
          <ContactField
            icon={Mail01Icon}
            label={t("profile.contact.email")}
            htmlFor={emailId}
            error={emailInvalid ? t("profile.contact.emailError") : null}
          >
            <Input
              id={emailId}
              type="email"
              value={draft.contactEmail}
              onChange={(event) => update({ contactEmail: event.target.value })}
              placeholder={t("profile.contact.emailPlaceholder")}
              maxLength={100}
              aria-invalid={emailInvalid || undefined}
            />
          </ContactField>
        </div>
      </div>
      <div className="flex flex-wrap items-start gap-x-5 gap-y-3 border-t px-4 py-3.5 sm:px-5">
        <div className="flex min-w-0 flex-[1_1_18rem] items-center gap-3.5">
          <SettingsIconTile icon={UserGroupIcon} />
          <div className="min-w-0">
            <p id={huntersTitleId} className="text-sm leading-5 font-medium">
              {t("profile.hunters.title")}
            </p>
            <p className={cn("mt-0.5", SETTINGS_DESCRIPTION_CLASS)}>{t("profile.hunters.description")}</p>
            {draft.isPublic ? null : <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{t("profile.hunters.requiresPublic")}</p>}
          </div>
        </div>
        {draft.hunterListing ? (
          <div className="flex min-w-0 flex-[1_1_20rem] flex-col gap-1.5 max-sm:order-last max-sm:basis-full">
            <RegionCombobox
              regions={regions}
              selectedRegions={draft.hunterRegions}
              onChange={(regionIds) => update({ hunterRegions: regionIds })}
              placeholder={t("profile.hunters.regionsPlaceholder")}
              invalid={regionsMissing || regionsTooMany}
            />
            <p className={cn("text-xs", regionsMissing || regionsTooMany ? "text-destructive" : "text-muted-foreground")}>
              {regionsTooMany ? t("profile.hunters.regionsMax", { max: HUNTER_REGIONS_MAX }) : t("profile.hunters.regionsHint")}
            </p>
          </div>
        ) : null}
        <Switch
          checked={draft.hunterListing}
          disabled={!draft.isPublic && !draft.hunterListing}
          aria-labelledby={huntersTitleId}
          onCheckedChange={(checked) => update({ hunterListing: checked })}
          className="mt-2"
        />
      </div>
      <SettingsCardFooter>
        {isDirty ? (
          <p className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
            {t("profile.unsaved")}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">{t("profile.allSaved")}</p>
        )}
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" disabled={!isDirty || saveMutation.isPending} onClick={() => setDraft(saved)}>
            {t("profile.discard")}
          </Button>
          <Button type="button" disabled={!isDirty || hasErrors || saveMutation.isPending} onClick={() => saveMutation.mutate(draft)}>
            {saveMutation.isPending ? <Spinner /> : null}
            {saveMutation.isPending ? t("common:actions.saving") : t("common:actions.saveChanges")}
          </Button>
        </div>
      </SettingsCardFooter>
    </SettingsCard>
  );
}

function ProfileSkeleton() {
  return (
    <SettingsCard aria-hidden="true">
      <div className="flex flex-col gap-2 px-4 py-4 sm:px-5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-64 max-w-full" />
      </div>
      <div className="grid gap-4 border-t px-4 py-4 sm:px-5 @3xl:grid-cols-2">
        <Skeleton className="h-36 w-full rounded-lg" />
        <Skeleton className="h-36 w-full rounded-lg" />
      </div>
      <div className="border-t px-4 py-4 sm:px-5">
        <Skeleton className="h-10 w-full rounded-lg" />
      </div>
    </SettingsCard>
  );
}

export function ProfileSection({ user }: { user: SettingsUser }) {
  const { t } = useTranslation("settings");
  const { data: profile, isError, isFetching, refetch } = useQuery(accountProfileQueryOptions(user.id));
  const { data: regions = [] } = useQuery({
    ...regionsQueryOptions(),
    select: (regions) => regions.filter((region) => region.countryCode === "PL"),
  });

  return (
    <SettingsSection id={SETTINGS_SECTION_IDS.profile} title={t("sections.profile")}>
      {profile ? (
        <ProfileCard key={user.id} user={user} profile={profile} regions={regions} />
      ) : isError ? (
        <ErrorState title={t("profile.loadError")} onRetry={() => refetch()} isRetrying={isFetching} />
      ) : (
        <ProfileSkeleton />
      )}
    </SettingsSection>
  );
}
