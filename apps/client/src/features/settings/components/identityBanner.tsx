import {
  Alert02Icon,
  ArrowUpRight01Icon,
  CheckmarkCircle02Icon,
  Globe02Icon,
  Key01Icon,
  LockIcon,
  SecurityCheckIcon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { accountProfileQueryOptions, apiKeysQueryOptions, isPublishableKey } from "../queries";
import { SETTINGS_SECTION_IDS } from "../sections";
import { scrollToSettingsSection } from "./settingsPrimitives";
import { RoleBadge } from "@/components/app/roleBadge";
import { roleWashClassName } from "@/components/app/roleTone";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { authClient } from "@/lib/auth/client";
import { getInitials, resolveAvatarUrl } from "@/lib/format";
import { cn } from "@/lib/utils";

export type SettingsUser = NonNullable<ReturnType<typeof authClient.useSession>["data"]>["user"];

function StatusChip({ icon, iconClassName, label, sectionId }: { icon: IconSvgElement; iconClassName?: string; label: string; sectionId: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="cursor-pointer text-muted-foreground"
      onClick={() => scrollToSettingsSection(sectionId)}
    >
      <HugeiconsIcon icon={icon} data-icon="inline-start" aria-hidden="true" className={iconClassName} />
      {label}
    </Button>
  );
}

export function IdentityBanner({ user }: { user: SettingsUser }) {
  const { t, i18n } = useTranslation("settings");
  const { data: profile } = useQuery(accountProfileQueryOptions(user.id));
  const { data: apiKeys } = useQuery(apiKeysQueryOptions(user.id));

  const isPublic = profile ? profile.profileVisibility !== "private" : null;
  const isHunter = profile ? profile.hunterListing && profile.profileVisibility !== "private" : false;
  const secretKeyCount = apiKeys ? apiKeys.keys.filter((key) => !isPublishableKey(key)).length : 0;
  const memberSince = new Date(user.createdAt).toLocaleDateString(i18n.language, { year: "numeric", month: "long", day: "numeric" });

  return (
    <section aria-label={user.name} className="overflow-hidden rounded-2xl border border-border/70 bg-background">
      <div className={cn("flex items-start gap-4 px-4 py-4 sm:px-6 sm:py-5", roleWashClassName(user.role))}>
        <div className="flex min-w-0 flex-1 items-center gap-3.5 sm:gap-4">
          <Avatar className="size-12 shrink-0 sm:size-14">
            <AvatarImage src={resolveAvatarUrl(user.image)} alt="" />
            <AvatarFallback className="text-base sm:text-lg">{getInitials(user.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <p className="truncate text-lg leading-7 font-semibold tracking-tight sm:text-xl">{user.name}</p>
              <RoleBadge role={user.role} />
            </div>
            <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-muted-foreground">
              {user.username ? (
                <>
                  <span className="truncate">@{user.username}</span>
                  <span aria-hidden="true" className="text-muted-foreground/40">
                    ·
                  </span>
                </>
              ) : null}
              <span className="min-w-0 truncate">{user.email}</span>
              {user.emailVerified ? (
                <Tooltip>
                  <TooltipTrigger render={<span className="inline-flex text-emerald-500" />}>
                    <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3.5" aria-label={t("identity.emailVerified")} />
                  </TooltipTrigger>
                  <TooltipContent>{t("identity.emailVerified")}</TooltipContent>
                </Tooltip>
              ) : null}
              <span aria-hidden="true" className="hidden text-muted-foreground/40 sm:inline">
                ·
              </span>
              <span className="w-full text-xs text-muted-foreground sm:w-auto">{t("common:labels.memberSince", { date: memberSince })}</span>
            </div>
          </div>
        </div>
        {user.username ? (
          <Link
            to="/users/$username"
            params={{ username: user.username }}
            className={cn(
              buttonVariants({ variant: "ghost" }),
              "shrink-0 bg-primary/10 font-semibold text-primary hover:bg-primary/20 hover:text-primary dark:hover:bg-primary/20",
            )}
          >
            <HugeiconsIcon icon={ArrowUpRight01Icon} data-icon="inline-start" aria-hidden="true" />
            <span className="max-sm:sr-only">{t("profile.viewProfile")}</span>
          </Link>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 px-4 py-3 sm:px-6">
        {isPublic !== null ? (
          <StatusChip
            icon={isPublic ? Globe02Icon : LockIcon}
            label={isPublic ? t("sections.profile") : t("common:labels.privateProfile")}
            sectionId={SETTINGS_SECTION_IDS.profile}
          />
        ) : null}
        {isHunter ? <StatusChip icon={UserGroupIcon} label={t("identity.huntersListed")} sectionId={SETTINGS_SECTION_IDS.profile} /> : null}
        <StatusChip
          icon={user.twoFactorEnabled ? SecurityCheckIcon : Alert02Icon}
          iconClassName={user.twoFactorEnabled ? "text-emerald-500" : "text-amber-500"}
          label={user.twoFactorEnabled ? t("identity.twoFactorOn") : t("identity.twoFactorOff")}
          sectionId={SETTINGS_SECTION_IDS.security}
        />
        {secretKeyCount > 0 ? (
          <StatusChip icon={Key01Icon} label={t("identity.apiKeys", { count: secretKeyCount })} sectionId={SETTINGS_SECTION_IDS.apps} />
        ) : null}
      </div>
    </section>
  );
}
