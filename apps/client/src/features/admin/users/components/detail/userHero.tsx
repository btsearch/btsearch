import {
  Alert02Icon,
  ArrowUpRight01Icon,
  CheckmarkCircle02Icon,
  ComputerIcon,
  LockKeyIcon,
  SecurityCheckIcon,
  UserBlock01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { profileVisibilityQueryOptions } from "../../api/activity";
import { userSessionsQueryOptions } from "../../api/authAdmin";
import { userGrantsQueryOptions } from "../../api/roleGrants";
import type { AdminUser } from "../../types";
import { getBanUntilLabel } from "../../utils/ban";
import { formatLongDate } from "../../utils/dates";
import { getAccountName } from "../../utils/identity";
import { USER_ROLE_ICONS } from "../shared/userRoleIcon";
import { UserStatusBadge } from "../shared/userStatusBadge";
import { TINTED_BUTTON_CLASS } from "./userDetailPrimitives";
import { USER_DETAIL_SECTION_IDS } from "./userDetailSections";
import { RoleBadge } from "@/components/app/roleBadge";
import { roleWashClassName } from "@/components/app/roleTone";
import { UserAvatar } from "@/components/app/userAvatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ImpersonateButton } from "@/features/impersonation/impersonateButton";
import { scrollToSettingsSection } from "@/features/settings/components/settingsPrimitives";
import { cn } from "@/lib/utils";

const HERO_NAME_ID = "user-hero-name";
const HERO_AVATAR_CLASS = "size-12 sm:size-18 *:data-[slot=avatar-fallback]:text-base sm:*:data-[slot=avatar-fallback]:text-2xl";
const PROFILE_LINK_CLASS = cn(buttonVariants({ variant: "ghost" }), TINTED_BUTTON_CLASS);
const PRIVATE_MARKER_CLASS = cn(
  "inline-flex h-7 items-center gap-1.5 rounded-lg border border-amber-500/25 bg-amber-500/8 px-2.5",
  "text-xs font-medium text-amber-700 dark:text-amber-400",
);

type HeroChipProps = {
  icon: IconSvgElement;
  iconClassName?: string;
  sectionId: string;
  children: ReactNode;
};

function getImpersonationBlocker(t: TFunction, user: AdminUser): string | undefined {
  if (user.role === "admin") return t("common:impersonation.unavailable.admin");
  if (user.isBanned) return t("common:impersonation.unavailable.banned");
  return undefined;
}

function HeroChip({ icon, iconClassName, sectionId, children }: HeroChipProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="cursor-pointer text-muted-foreground"
      onClick={() => scrollToSettingsSection(sectionId)}
    >
      <HugeiconsIcon icon={icon} data-icon="inline-start" aria-hidden="true" className={iconClassName} />
      {children}
    </Button>
  );
}

function HeroChipSkeleton() {
  return <Skeleton aria-hidden="true" className="h-7 w-36 rounded-lg" />;
}

function GrantsChip({ user }: { user: AdminUser }) {
  const { t } = useTranslation("admin");
  const { data: grants, isPending } = useQuery({ ...userGrantsQueryOptions(user.id), enabled: user.role === "editor" });
  const roleIcon = USER_ROLE_ICONS[user.role];

  if (user.role === "admin") {
    return (
      <HeroChip icon={roleIcon.icon} iconClassName={roleIcon.className} sectionId={USER_DETAIL_SECTION_IDS.roles}>
        {t("users.detail.hero.allCountries")}
      </HeroChip>
    );
  }
  if (user.role !== "editor") return null;
  if (grants === undefined) return isPending ? <HeroChipSkeleton /> : null;

  const countryCount = new Set(grants.map((grant) => grant.countryCode)).size;
  if (countryCount === 0) return null;

  return (
    <HeroChip icon={roleIcon.icon} iconClassName={roleIcon.className} sectionId={USER_DETAIL_SECTION_IDS.roles}>
      {t("users.detail.hero.grantCountries", { count: countryCount })}
    </HeroChip>
  );
}

function SessionsChip({ userId }: { userId: string }) {
  const { t } = useTranslation("admin");
  const { data: sessions, isPending } = useQuery(userSessionsQueryOptions(userId));
  if (sessions === undefined) return isPending ? <HeroChipSkeleton /> : null;

  return (
    <HeroChip icon={ComputerIcon} sectionId={USER_DETAIL_SECTION_IDS.security}>
      {t("users.detail.hero.sessions", { count: sessions.length })}
    </HeroChip>
  );
}

function PrivateProfileMarker({ user }: { user: AdminUser }) {
  const { t } = useTranslation("admin");
  const { data: visibility } = useQuery(profileVisibilityQueryOptions(user.id, user.username));
  if (visibility !== "private") return null;

  return (
    <span className={PRIVATE_MARKER_CLASS}>
      <HugeiconsIcon icon={LockKeyIcon} className="size-3.5" aria-hidden="true" />
      {t("common:labels.privateProfile")}
    </span>
  );
}

function HeroMeta({ user }: { user: AdminUser }) {
  const { t, i18n } = useTranslation("admin");
  const memberSince = formatLongDate(user.createdAt, i18n.language);

  return (
    <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-muted-foreground">
      {user.username ? (
        <>
          <span className="truncate">@{user.username}</span>
          <span aria-hidden="true" className="text-muted-foreground/40">
            ·
          </span>
        </>
      ) : null}
      <span className="min-w-0 wrap-anywhere">{user.email}</span>
      {user.isEmailVerified ? (
        <Tooltip>
          <TooltipTrigger render={<span className="inline-flex text-emerald-500" />}>
            <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3.5" aria-label={t("settings:identity.emailVerified")} />
          </TooltipTrigger>
          <TooltipContent>{t("settings:identity.emailVerified")}</TooltipContent>
        </Tooltip>
      ) : null}
      <span aria-hidden="true" className="hidden text-muted-foreground/40 sm:inline">
        ·
      </span>
      <span className="w-full text-xs text-muted-foreground sm:w-auto">{t("common:labels.memberSince", { date: memberSince })}</span>
    </div>
  );
}

export function UserHero({ user, isSelf }: { user: AdminUser; isSelf: boolean }) {
  const { t, i18n } = useTranslation("admin");
  const accountName = getAccountName(user);
  const hasActions = !isSelf || Boolean(user.username);

  return (
    <section aria-labelledby={HERO_NAME_ID} className="overflow-hidden rounded-2xl border border-border/70 bg-background">
      <div className={cn("flex flex-wrap items-center gap-x-5 gap-y-3.5 px-4 py-4 sm:flex-nowrap sm:px-7 sm:py-6", roleWashClassName(user.role))}>
        <div className="flex min-w-0 flex-1 items-start gap-3.5 max-sm:basis-full sm:items-center sm:gap-5">
          <UserAvatar user={{ name: accountName, image: user.image }} className={HERO_AVATAR_CLASS} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <h1 id={HERO_NAME_ID} className="min-w-0 text-lg leading-7 font-bold tracking-tight wrap-break-word sm:text-2xl sm:leading-8">
                {accountName}
                {isSelf ? <span className="font-normal text-muted-foreground"> {t("users.shared.you")}</span> : null}
              </h1>
              <RoleBadge role={user.role} />
              {user.isBanned ? <UserStatusBadge status="banned" /> : null}
            </div>
            <HeroMeta user={user} />
          </div>
        </div>
        {hasActions ? (
          <div className="grid shrink-0 auto-cols-fr grid-flow-col gap-2 max-sm:w-full sm:flex sm:items-center">
            {isSelf ? null : <ImpersonateButton user={{ id: user.id, name: accountName }} unavailableReason={getImpersonationBlocker(t, user)} />}
            {user.username ? (
              <Link to="/users/$username" params={{ username: user.username }} className={PROFILE_LINK_CLASS}>
                <HugeiconsIcon icon={ArrowUpRight01Icon} data-icon="inline-start" aria-hidden="true" />
                {t("settings:profile.viewProfile")}
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 px-4 py-3 sm:px-7">
        <GrantsChip user={user} />
        {user.isEmailVerified ? null : (
          <HeroChip icon={Alert02Icon} iconClassName="text-amber-500" sectionId={USER_DETAIL_SECTION_IDS.account}>
            {t("users.detail.hero.emailUnverified")}
          </HeroChip>
        )}
        <HeroChip
          icon={user.isTwoFactorEnabled ? SecurityCheckIcon : Alert02Icon}
          iconClassName={user.isTwoFactorEnabled ? "text-emerald-500" : "text-amber-500"}
          sectionId={USER_DETAIL_SECTION_IDS.security}
        >
          {user.isTwoFactorEnabled ? t("settings:identity.twoFactorOn") : t("settings:identity.twoFactorOff")}
        </HeroChip>
        {user.isBanned ? (
          <HeroChip icon={UserBlock01Icon} iconClassName="text-destructive" sectionId={USER_DETAIL_SECTION_IDS.moderation}>
            {t("users.detail.hero.banned", { until: getBanUntilLabel(t, i18n.language, user.banExpiresAt, "short") })}
          </HeroChip>
        ) : (
          <SessionsChip userId={user.id} />
        )}
        <PrivateProfileMarker user={user} />
      </div>
    </section>
  );
}
