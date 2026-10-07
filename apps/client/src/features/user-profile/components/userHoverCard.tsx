import {
  ArrowRight01Icon,
  Calendar03Icon,
  Facebook01Icon,
  InstagramIcon,
  Link01Icon,
  LockKeyIcon,
  Mail01Icon,
  Message01Icon,
  PencilEdit02Icon,
  Radar01Icon,
  Tick02Icon,
  UserSettings01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { type UserProfile, userProfileQueryOptions } from "../queries";
import { RoleBadge } from "@/components/app/roleBadge";
import { roleWashClassName } from "@/components/app/roleTone";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { InlineError } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCopyText } from "@/features/settings/copyText";
import { ApiResponseError } from "@/lib/api";
import { authClient } from "@/lib/auth/client";
import { getInitials, resolveAvatarUrl } from "@/lib/format";
import { cn } from "@/lib/utils";

type Identity = { username: string; name: string | null; image: string | null; role: string | null };

const HEADER_CLASS = "flex items-center gap-3 border-b border-border/60 p-3";
const FOCUS_CLASS = "outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

function IdentitySummary({ identity }: { identity: Identity }) {
  const handle = `@${identity.username}`;

  return (
    <>
      <Avatar className="size-12 shrink-0">
        <AvatarImage src={resolveAvatarUrl(identity.image)} alt="" />
        <AvatarFallback className="text-base">{getInitials(identity.name || identity.username)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-semibold">{identity.name || handle}</p>
          <RoleBadge role={identity.role} className="shrink-0" />
        </div>
        {identity.name ? <p className="truncate text-xs text-muted-foreground">{handle}</p> : null}
      </div>
    </>
  );
}

function ProfileHeaderLink({ identity, onNavigate }: { identity: Identity; onNavigate: () => void }) {
  const { t } = useTranslation("settings");

  return (
    <Link
      to="/users/$username"
      params={{ username: identity.username }}
      onClick={onNavigate}
      className={cn(HEADER_CLASS, FOCUS_CLASS, "group/profile hover:bg-muted/50", roleWashClassName(identity.role))}
    >
      <IdentitySummary identity={identity} />
      <span
        aria-hidden="true"
        className="shrink-0 text-muted-foreground transition-transform group-hover/profile:translate-x-0.5 group-hover/profile:text-foreground"
      >
        <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
      </span>
      <span className="sr-only">{t("profile.viewProfile")}</span>
    </Link>
  );
}

function Fact({ icon, className, children }: { icon: IconSvgElement; className?: string; children: ReactNode }) {
  return (
    <li className={cn("flex min-w-0 items-center gap-1.5", className)}>
      <HugeiconsIcon icon={icon} className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{children}</span>
    </li>
  );
}

function CopyProfileLinkButton({ username }: { username: string }) {
  const { t } = useTranslation("common");
  const { copied, copy } = useCopyText();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn("cursor-pointer text-muted-foreground", copied && "text-emerald-700 dark:text-emerald-400")}
      onClick={() => copy(`${window.location.origin}/users/${encodeURIComponent(username)}`)}
    >
      <HugeiconsIcon icon={copied ? Tick02Icon : Link01Icon} data-icon="inline-start" aria-hidden="true" />
      {copied ? t("actions.linkCopied") : t("actions.copyLink")}
    </Button>
  );
}

function ContactAction({ href, label, icon, external = false }: { href: string; label: string; icon: IconSvgElement; external?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <a
            href={href}
            aria-label={label}
            target={external ? "_blank" : undefined}
            rel={external ? "noopener noreferrer" : undefined}
            className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "text-muted-foreground")}
          />
        }
      >
        <HugeiconsIcon icon={icon} aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function ProfileCard({ profile, username, onNavigate }: { profile: UserProfile; username: string; onNavigate: () => void }) {
  const { t, i18n } = useTranslation("main");
  const { data: session } = authClient.useSession();
  const user = profile;
  const { contact } = profile;
  const identity = { username: user.username ?? username, name: user.name, image: user.image, role: user.role };
  const memberSince = new Date(user.createdAt).toLocaleDateString(i18n.language, { year: "numeric", month: "long", day: "numeric" });
  const commentCount = profile.comments?.total ?? 0;
  const hunterRegionCount = profile.hunterRegionIds?.length ?? 0;
  const isOwner = session?.user.id === user.id;
  const isAdmin = session?.user.role === "admin";

  return (
    <>
      <ProfileHeaderLink identity={identity} onNavigate={onNavigate} />
      <div className="flex flex-col gap-2 px-3 py-2.5">
        {user.bio ? (
          <p className="line-clamp-3 text-[0.8125rem] leading-[1.125rem] whitespace-pre-line text-foreground/90 wrap-break-word">{user.bio}</p>
        ) : null}
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <Fact icon={Calendar03Icon}>{t("common:labels.memberSince", { date: memberSince })}</Fact>
          {commentCount > 0 ? <Fact icon={Message01Icon}>{t("userProfile.commentCount", { count: commentCount })}</Fact> : null}
          {hunterRegionCount > 0 ? (
            <Fact icon={Radar01Icon}>
              {t("userProfile.hunter.title")}
              <span aria-hidden="true" className="mx-1 text-muted-foreground/40">
                ·
              </span>
              {t("userProfile.regionCount", { count: hunterRegionCount })}
            </Fact>
          ) : null}
          {profile.visibility === "private" ? (
            <Fact icon={LockKeyIcon} className="text-amber-700 dark:text-amber-400">
              {t("common:labels.privateProfile")}
            </Fact>
          ) : null}
        </ul>
      </div>
      <div className="flex items-center gap-0.5 border-t border-border/60 p-1.5">
        <CopyProfileLinkButton username={identity.username} />
        {contact?.email ? <ContactAction href={`mailto:${contact.email}`} label={t("userProfile.contact.sendEmail")} icon={Mail01Icon} /> : null}
        {contact?.instagram ? (
          <ContactAction
            href={`https://instagram.com/${contact.instagram}`}
            label={t("userProfile.contact.openInstagram")}
            icon={InstagramIcon}
            external
          />
        ) : null}
        {contact?.facebook ? (
          <ContactAction href={contact.facebook} label={t("userProfile.contact.openFacebook")} icon={Facebook01Icon} external />
        ) : null}
        {isOwner ? (
          <Link
            to="/settings"
            search={{ tab: "profile" }}
            onClick={onNavigate}
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "ml-auto bg-primary/10 font-semibold text-primary hover:bg-primary/20 hover:text-primary dark:hover:bg-primary/20",
            )}
          >
            <HugeiconsIcon icon={PencilEdit02Icon} data-icon="inline-start" aria-hidden="true" />
            {t("userProfile.editProfile")}
          </Link>
        ) : null}
      </div>
      {isAdmin ? (
        <div className="border-t border-border/60 p-1">
          <Link
            to="/admin/users/$id"
            params={{ id: user.id }}
            onClick={onNavigate}
            className={cn(FOCUS_CLASS, "flex h-8 items-center gap-2.5 rounded-md px-2 text-sm hover:bg-muted")}
          >
            <HugeiconsIcon icon={UserSettings01Icon} className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            {t("userProfile.manageUser")}
            <HugeiconsIcon icon={ArrowRight01Icon} className="ml-auto size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Link>
        </div>
      ) : null}
    </>
  );
}

type UserHoverCardProps = {
  username: string;
  name: string | null;
  image: string | null;
  onNavigate: () => void;
};

export function UserHoverCard({ username, name, image, onNavigate }: UserHoverCardProps) {
  const { t } = useTranslation("common");
  const { data: session, isPending: isSessionPending, error: sessionError, refetch: refetchSession } = authClient.useSession();
  const isViewerReady = !isSessionPending && !sessionError;
  const {
    data: profile,
    error,
    isFetching,
    refetch,
  } = useQuery({
    ...userProfileQueryOptions(username, session?.user.id ?? null),
    enabled: isViewerReady,
  });
  const identity = { username, name, image, role: null };
  const loadError = sessionError ?? error;
  if (isViewerReady && error instanceof ApiResponseError && error.status === 404)
    return (
      <>
        <div className={cn(HEADER_CLASS, roleWashClassName(null))}>
          <IdentitySummary identity={identity} />
        </div>
        <p className="px-3 py-2.5 text-xs text-muted-foreground">{t("error.userNotFound")}</p>
      </>
    );

  if (isViewerReady && profile !== undefined) return <ProfileCard profile={profile} username={username} onNavigate={onNavigate} />;

  return (
    <>
      <ProfileHeaderLink identity={identity} onNavigate={onNavigate} />
      {!isSessionPending && loadError ? (
        <InlineError size="sm" onRetry={() => void (sessionError ? refetchSession() : refetch())} isRetrying={isFetching} className="m-1.5" />
      ) : (
        <div aria-busy="true">
          <div className="px-3 py-2.5">
            <Skeleton className="h-4 w-3/5" />
          </div>
          <div className="border-t border-border/60 p-1.5">
            <Skeleton className="h-7 w-24" />
          </div>
        </div>
      )}
    </>
  );
}
