import { ArrowUpRight01Icon, BalanceScaleIcon, FileUploadIcon, SmartPhone01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type { MeasurementContributor } from "@openbts/shared/contract";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { useContributorName } from "../components/contributorIdentity";
import { BlockBadge, LOW_WEIGHT_TEXT_CLASS, VouchBadge } from "../contributors/contributorBadges";
import { getTermsNote } from "../contributors/contributorListCells";
import { formatWeight } from "../utils/format";
import { PERSON_SECTION_IDS } from "./personSections";
import { roleWashClassName } from "@/components/app/roleTone";
import { UserAvatar } from "@/components/app/userAvatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { TINTED_BUTTON_CLASS } from "@/features/admin/users/components/detail/userDetailPrimitives";
import { scrollToSettingsSection } from "@/features/settings/components/settingsPrimitives";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type PersonHeroProps = {
  contributor: MeasurementContributor;
  currentTermsVersion: number | null;
};

type HeroChipProps = {
  icon: IconSvgElement;
  sectionId: string;
  children: ReactNode;
};

const HERO_NAME_ID = "person-hero-name";
const HERO_AVATAR_CLASS = "size-12 sm:size-18 *:data-[slot=avatar-fallback]:text-base sm:*:data-[slot=avatar-fallback]:text-2xl";
const ACCOUNT_LINK_CLASS = cn(buttonVariants({ variant: "ghost" }), TINTED_BUTTON_CLASS);

function HeroChip({ icon, sectionId, children }: HeroChipProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="cursor-pointer text-muted-foreground"
      onClick={() => scrollToSettingsSection(sectionId)}
    >
      <HugeiconsIcon icon={icon} data-icon="inline-start" aria-hidden="true" />
      {children}
    </Button>
  );
}

function HeroMeta({ contributor, currentTermsVersion }: PersonHeroProps) {
  const { t, i18n } = useTranslation("admin");
  const { username } = contributor.user;
  const terms = getTermsNote(t, contributor.termsVersion, currentTermsVersion);

  return (
    <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-muted-foreground">
      {username ? (
        <>
          <span className="truncate">@{username}</span>
          <span aria-hidden="true" className="text-muted-foreground/40">
            ·
          </span>
        </>
      ) : null}
      <span>
        {contributor.firstUploadAt === null
          ? t("measurements.contributors.noUploads")
          : t("measurements.contributors.firstUploadOn", { date: formatShortDate(contributor.firstUploadAt, i18n.language) })}
      </span>
      <span aria-hidden="true" className="text-muted-foreground/40">
        ·
      </span>
      <span className={cn("text-xs", terms.isOutdated && LOW_WEIGHT_TEXT_CLASS)}>{terms.text}</span>
    </div>
  );
}

export function PersonHero({ contributor, currentTermsVersion }: PersonHeroProps) {
  const { t, i18n } = useTranslation("admin");
  const name = useContributorName(contributor.user);
  const { user, vouch, block, weight } = contributor;
  const activeDeviceCount = contributor.deviceCount - contributor.revokedDeviceCount;
  const activeDevices = t("measurements.person.hero.activeDevices", { count: activeDeviceCount });

  return (
    <section aria-labelledby={HERO_NAME_ID} className="overflow-hidden rounded-2xl border border-border/70 bg-background">
      <div className={cn("flex flex-wrap items-center gap-x-5 gap-y-3.5 px-4 py-4 sm:flex-nowrap sm:px-7 sm:py-6", roleWashClassName("user"))}>
        <div className="flex min-w-0 flex-1 items-start gap-3.5 max-sm:basis-full sm:items-center sm:gap-5">
          <UserAvatar user={{ name, image: user.image }} className={HERO_AVATAR_CLASS} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <h1 id={HERO_NAME_ID} className="min-w-0 text-lg leading-7 font-bold tracking-tight wrap-break-word sm:text-2xl sm:leading-8">
                {name}
              </h1>
              {vouch === null ? null : <VouchBadge weight={vouch.weight} />}
              {block === null ? null : <BlockBadge>{t("measurements.person.block.blockedTitle")}</BlockBadge>}
            </div>
            <HeroMeta contributor={contributor} currentTermsVersion={currentTermsVersion} />
          </div>
        </div>
        <Link to="/admin/users/$id" params={{ id: user.id }} className={cn(ACCOUNT_LINK_CLASS, "max-sm:w-full")}>
          <HugeiconsIcon icon={ArrowUpRight01Icon} data-icon="inline-start" aria-hidden="true" />
          {t("measurements.person.userAccount")}
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 px-4 py-3 sm:px-7">
        <HeroChip icon={BalanceScaleIcon} sectionId={PERSON_SECTION_IDS.trust}>
          {t("measurements.person.weightValue", { weight: formatWeight(weight.effective, i18n.language) })}
        </HeroChip>
        <HeroChip icon={SmartPhone01Icon} sectionId={PERSON_SECTION_IDS.devices}>
          {contributor.revokedDeviceCount === 0
            ? activeDevices
            : t("measurements.person.hero.devicesAndRevoked", { devices: activeDevices, count: contributor.revokedDeviceCount })}
        </HeroChip>
        <HeroChip icon={FileUploadIcon} sectionId={PERSON_SECTION_IDS.uploads}>
          {t("measurements.person.hero.uploads", { count: contributor.uploadCount })}
        </HeroChip>
      </div>
    </section>
  );
}
