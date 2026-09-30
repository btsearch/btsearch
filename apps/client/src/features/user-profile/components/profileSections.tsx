import {
  ArrowUpRight01Icon,
  Copy01Icon,
  Facebook01Icon,
  InstagramIcon,
  LockKeyIcon,
  Login01Icon,
  Mail01Icon,
  PencilEdit02Icon,
  Radar01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { ContactDetails } from "../queries";
import { AuthDialog } from "@/components/auth/authDialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  SETTINGS_DESCRIPTION_CLASS,
  SettingsCard,
  SettingsIconTile,
  SettingsRow,
  SettingsSection,
} from "@/features/settings/components/settingsPrimitives";
import { useCopyText } from "@/features/settings/copyText";
import { regionsQueryOptions } from "@/features/shared/queries";
import { cn } from "@/lib/utils";

export const PROFILE_SECTION_IDS = {
  about: "profile-about",
  contact: "profile-contact",
  hunters: "profile-hunters",
  comments: "profile-comments",
} as const;

export const PROFILE_GRID_CLASS = "grid items-start gap-8 @4xl:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)] @4xl:gap-x-6";

export const EDIT_PROFILE_SEARCH = { tab: "profile" } as const;

const FACEBOOK_URL_PREFIX = /^https:\/\/(www\.)?/;

function OwnerPrompt({ title, description, action }: { title: string; description: string; action: string }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed px-4 py-4 sm:px-5">
      <div>
        <p className="text-sm leading-5 font-medium">{title}</p>
        <p className={cn("mt-0.5", SETTINGS_DESCRIPTION_CLASS)}>{description}</p>
      </div>
      <Link to="/settings" search={EDIT_PROFILE_SEARCH} className={buttonVariants({ variant: "outline", size: "sm" })}>
        <HugeiconsIcon icon={PencilEdit02Icon} data-icon="inline-start" aria-hidden="true" />
        {action}
      </Link>
    </div>
  );
}

export function ProfileAbout({ bio, isOwner }: { bio: string | null; isOwner: boolean }) {
  const { t } = useTranslation("main");
  if (!bio && !isOwner) return null;

  return (
    <SettingsSection id={PROFILE_SECTION_IDS.about} title={t("common:labels.aboutMe")}>
      {bio ? (
        <SettingsCard className="px-4 py-3.5 sm:px-5 sm:py-4">
          <p className="text-sm leading-[1.375rem] whitespace-pre-line text-foreground/90 wrap-break-word">{bio}</p>
        </SettingsCard>
      ) : (
        <OwnerPrompt
          title={t("userProfile.ownerPrompts.bioTitle")}
          description={t("userProfile.ownerPrompts.bioDescription")}
          action={t("userProfile.ownerPrompts.bioAction")}
        />
      )}
    </SettingsSection>
  );
}

function ContactLink({ href, label, external = false }: { href: string; label: string; external?: boolean }) {
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
        <HugeiconsIcon icon={ArrowUpRight01Icon} aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function CopyEmailButton({ email }: { email: string }) {
  const { t } = useTranslation("main");
  const { copied, copy } = useCopyText();
  const label = copied ? t("userProfile.contact.emailCopied") : t("userProfile.contact.copyEmail");

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            className="cursor-pointer text-muted-foreground"
            onClick={() => copy(email)}
          />
        }
      >
        <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function LockedContact() {
  const { t } = useTranslation("main");
  const [authOpen, setAuthOpen] = useState(false);

  return (
    <SettingsCard>
      <SettingsRow icon={LockKeyIcon} title={t("userProfile.contact.lockedTitle")} description={t("userProfile.contact.lockedDescription")} wrap>
        <Button type="button" variant="outline" size="sm" className="cursor-pointer" onClick={() => setAuthOpen(true)}>
          <HugeiconsIcon icon={Login01Icon} data-icon="inline-start" aria-hidden="true" />
          {t("common:actions.signIn")}
        </Button>
      </SettingsRow>
      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
    </SettingsCard>
  );
}

function ContactContent({ contact, contactHidden }: { contact: ContactDetails | null; contactHidden: boolean }) {
  const { t } = useTranslation("main");
  if (contactHidden) return <LockedContact />;
  if (contact === null)
    return (
      <OwnerPrompt
        title={t("userProfile.ownerPrompts.contactTitle")}
        description={t("userProfile.ownerPrompts.contactDescription")}
        action={t("userProfile.ownerPrompts.contactAction")}
      />
    );

  return (
    <SettingsCard>
      {contact.instagram ? (
        <SettingsRow icon={InstagramIcon} title="Instagram" description={<span className="block truncate">@{contact.instagram}</span>}>
          <ContactLink href={`https://instagram.com/${contact.instagram}`} label={t("userProfile.contact.openInstagram")} external />
        </SettingsRow>
      ) : null}
      {contact.facebook ? (
        <SettingsRow
          icon={Facebook01Icon}
          title="Facebook"
          description={<span className="block truncate">{contact.facebook.replace(FACEBOOK_URL_PREFIX, "")}</span>}
        >
          <ContactLink href={contact.facebook} label={t("userProfile.contact.openFacebook")} external />
        </SettingsRow>
      ) : null}
      {contact.email ? (
        <SettingsRow icon={Mail01Icon} title={t("common:labels.email")} description={<span className="block truncate">{contact.email}</span>}>
          <CopyEmailButton email={contact.email} />
          <ContactLink href={`mailto:${contact.email}`} label={t("userProfile.contact.sendEmail")} />
        </SettingsRow>
      ) : null}
    </SettingsCard>
  );
}

export function ProfileContact({ contact, contactHidden, isOwner }: { contact: ContactDetails | null; contactHidden: boolean; isOwner: boolean }) {
  const { t } = useTranslation("main");
  if (!contactHidden && contact === null && !isOwner) return null;

  return (
    <SettingsSection id={PROFILE_SECTION_IDS.contact} title={t("userProfile.sections.contact")}>
      <ContactContent contact={contact} contactHidden={contactHidden} />
    </SettingsSection>
  );
}

export function ProfileHunter({ regionIds }: { regionIds: number[] }) {
  const { t } = useTranslation("main");
  const { data: regions = [] } = useQuery(regionsQueryOptions());
  const regionNames = new Map(regions.map((region) => [region.id, region.name]));

  return (
    <SettingsSection id={PROFILE_SECTION_IDS.hunters} title={t("userProfile.sections.hunters")}>
      <SettingsCard>
        <div className="flex items-start gap-3.5 px-4 py-3.5 sm:px-5 sm:py-4">
          <SettingsIconTile icon={Radar01Icon} className="bg-primary/12 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-5 font-semibold">{t("userProfile.hunter.title")}</p>
            <p className={cn("mt-0.5", SETTINGS_DESCRIPTION_CLASS)}>{t("userProfile.hunter.description")}</p>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {regionIds.map((regionId) => {
                const name = regionNames.get(regionId);
                return name ? (
                  <li key={regionId}>
                    <Badge variant="secondary">{name}</Badge>
                  </li>
                ) : null;
              })}
            </ul>
          </div>
        </div>
        <Link
          to="/hunters"
          className="flex items-center justify-between gap-2 border-t bg-muted/50 px-4 py-2.5 text-[0.8125rem] leading-[1.125rem] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:px-5"
        >
          {t("userProfile.hunter.directory")}
          <HugeiconsIcon icon={ArrowUpRight01Icon} className="size-3.5" aria-hidden="true" />
        </Link>
      </SettingsCard>
    </SettingsSection>
  );
}
