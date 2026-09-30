import { Link01Icon, LockKeyIcon, Message01Icon, PencilEdit02Icon, Radar01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { UserProfile } from "../queries";
import { EDIT_PROFILE_SEARCH, PROFILE_SECTION_IDS } from "./profileSections";
import { RoleBadge } from "@/components/app/roleBadge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { getInitials } from "@/features/settings/components/identityBanner";
import { scrollToSettingsSection } from "@/features/settings/components/settingsPrimitives";
import { useCopyText } from "@/features/settings/copyText";
import { resolveAvatarUrl } from "@/lib/format";
import { cn } from "@/lib/utils";

function CopyLinkButton({ iconOnly = false, className }: { iconOnly?: boolean; className?: string }) {
  const { t } = useTranslation("main");
  const { copied, copy } = useCopyText();
  const label = copied ? t("common:actions.linkCopied") : t("common:actions.copyLink");

  return (
    <Button
      type="button"
      variant="outline"
      size={iconOnly ? "icon-lg" : "default"}
      aria-label={iconOnly ? t("userProfile.copyLinkLabel") : undefined}
      className={cn("cursor-pointer", copied && "text-emerald-600 dark:text-emerald-400", className)}
      onClick={() => copy(`${window.location.origin}${window.location.pathname}`)}
    >
      <HugeiconsIcon icon={copied ? Tick02Icon : Link01Icon} data-icon={iconOnly ? undefined : "inline-start"} aria-hidden="true" />
      {iconOnly ? null : label}
    </Button>
  );
}

function EditProfileLink({ className }: { className?: string }) {
  const { t } = useTranslation("main");

  return (
    <Link
      to="/settings"
      search={EDIT_PROFILE_SEARCH}
      className={cn(
        buttonVariants({ variant: "ghost" }),
        "bg-primary/10 font-semibold text-primary hover:bg-primary/20 hover:text-primary dark:hover:bg-primary/20",
        className,
      )}
    >
      <HugeiconsIcon icon={PencilEdit02Icon} data-icon="inline-start" aria-hidden="true" />
      {t("userProfile.editProfile")}
    </Link>
  );
}

function ProfileChip({ icon, targetId, children }: { icon: IconSvgElement; targetId: string; children: ReactNode }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="cursor-pointer text-muted-foreground"
      onClick={() => scrollToSettingsSection(targetId)}
    >
      <HugeiconsIcon icon={icon} data-icon="inline-start" aria-hidden="true" />
      {children}
    </Button>
  );
}

function PrivateChip() {
  const { t } = useTranslation("main");

  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-amber-500/25 bg-amber-500/8 px-2.5 text-xs font-medium text-amber-600 dark:text-amber-400">
      <HugeiconsIcon icon={LockKeyIcon} className="size-3.5" aria-hidden="true" />
      {t("common:labels.privateProfile")}
    </span>
  );
}

function OwnerPrivateNotice() {
  const { t } = useTranslation("main");

  return (
    <div className="flex flex-col items-start gap-2.5 border-t border-amber-500/20 bg-amber-500/6 px-4 py-3 sm:flex-row sm:items-center sm:gap-3 sm:px-7">
      <p className="flex flex-1 gap-2.5 text-[0.8125rem] leading-[1.125rem]">
        <HugeiconsIcon icon={LockKeyIcon} className="mt-px size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        {t("userProfile.ownerPrivateNotice")}
      </p>
      <Link to="/settings" search={EDIT_PROFILE_SEARCH} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "max-sm:ml-6.5")}>
        {t("userProfile.changeVisibility")}
      </Link>
    </div>
  );
}

export function ProfileHero({ profile, isOwner }: { profile: UserProfile; isOwner: boolean }) {
  const { t, i18n } = useTranslation("main");
  const { user } = profile;
  const memberSince = new Date(user.createdAt).toLocaleDateString(i18n.language, { year: "numeric", month: "long", day: "numeric" });
  const isPrivate = profile.visibility === "private";
  const commentCount = profile.comments?.totalCount ?? 0;
  const hunterRegionCount = profile.hunter?.regions.length ?? 0;
  const handle = user.username ? `@${user.username}` : null;

  return (
    <section aria-labelledby="profile-name" className="overflow-hidden rounded-2xl border border-border/70 bg-background">
      <div className="bg-linear-115 from-primary/14 via-primary/6 via-34% to-transparent to-70% px-4 py-4 sm:px-7 sm:py-7">
        <div className="flex items-start gap-4 sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3.5 sm:gap-5">
            <Avatar className="size-16 shrink-0 sm:size-22">
              <AvatarImage src={resolveAvatarUrl(user.image)} alt="" />
              <AvatarFallback className="text-xl sm:text-3xl">{getInitials(user.name ?? user.username ?? "")}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <h1 id="profile-name" className="min-w-0 text-xl leading-7 font-bold tracking-tight wrap-break-word sm:text-[1.75rem] sm:leading-9">
                  {user.name ?? handle}
                </h1>
                <RoleBadge role={user.role} />
              </div>
              <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-muted-foreground">
                {user.name && handle ? (
                  <>
                    <span className="truncate">{handle}</span>
                    <span aria-hidden="true" className="hidden text-muted-foreground/40 sm:inline">
                      ·
                    </span>
                  </>
                ) : null}
                <span className="w-full text-xs text-muted-foreground sm:w-auto">{t("common:labels.memberSince", { date: memberSince })}</span>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 max-sm:hidden">
            {isOwner ? <EditProfileLink /> : null}
            <CopyLinkButton />
          </div>
          {isOwner ? null : <CopyLinkButton iconOnly className="sm:hidden" />}
        </div>
        {isOwner ? (
          <div className="mt-4 flex gap-2 sm:hidden">
            <EditProfileLink className="h-10 flex-1" />
            <CopyLinkButton iconOnly className="size-10" />
          </div>
        ) : null}
      </div>
      {isPrivate || commentCount > 0 || hunterRegionCount > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 px-4 py-3 sm:px-7">
          {isPrivate ? <PrivateChip /> : null}
          {commentCount > 0 ? (
            <ProfileChip icon={Message01Icon} targetId={PROFILE_SECTION_IDS.comments}>
              {t("userProfile.commentCount", { count: commentCount })}
            </ProfileChip>
          ) : null}
          {hunterRegionCount > 0 ? (
            <ProfileChip icon={Radar01Icon} targetId={PROFILE_SECTION_IDS.hunters}>
              {t("userProfile.hunter.title")}
              <span aria-hidden="true" className="text-muted-foreground/40">
                ·
              </span>
              {t("userProfile.regionCount", { count: hunterRegionCount })}
            </ProfileChip>
          ) : null}
        </div>
      ) : null}
      {isOwner && isPrivate ? <OwnerPrivateNotice /> : null}
    </section>
  );
}
