import type { MeasurementContributor } from "@openbts/shared/contract";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { formatShare, formatWeight } from "../utils/format";
import { BlockBadge, LOW_WEIGHT_TEXT_CLASS, LowWeightMark, VouchBadge, isLowWeight } from "./contributorBadges";
import { EmptyValue } from "@/components/ui/emptyValue";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ContributorListRow = {
  contributor: MeasurementContributor;
  currentTermsVersion: number | null;
};

const SECOND_LINE_CLASS = "block truncate text-xs text-muted-foreground";

function getUntilLabel(t: TFunction, language: string, endsAt: string | null): string {
  return endsAt === null ? t("admin:users.shared.ban.permanent") : t("admin:users.shared.ban.until", { date: formatShortDate(endsAt, language) });
}

export function getEffectiveWeightNote(t: TFunction, language: string, contributor: MeasurementContributor): string | null {
  const { computed, effective } = contributor.weight;
  const effectiveText = formatWeight(effective, language);
  if (effectiveText === formatWeight(computed, language)) return null;
  return contributor.vouch === null
    ? t("measurements.contributors.effective", { weight: effectiveText })
    : t("measurements.contributors.effectiveFromVouch", { weight: effectiveText });
}

export function getTermsNote(t: TFunction, termsVersion: number | null, currentTermsVersion: number | null): { text: string; isOutdated: boolean } {
  if (termsVersion === null) return { text: t("measurements.contributors.termsNone"), isOutdated: true };
  if (currentTermsVersion !== null && termsVersion < currentTermsVersion) {
    return { text: t("measurements.contributors.termsOutdated", { version: termsVersion, current: currentTermsVersion }), isOutdated: true };
  }
  return { text: t("measurements.contributors.terms", { version: termsVersion }), isOutdated: false };
}

export function ComputedWeight({ weight, prefix }: { weight: number; prefix?: string }) {
  const { i18n } = useTranslation();
  const isLow = isLowWeight(weight);
  const text = formatWeight(weight, i18n.language);

  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 font-semibold tabular-nums", isLow && LOW_WEIGHT_TEXT_CLASS)}>
      {prefix === undefined ? text : `${prefix} ${text}`}
      {isLow ? <LowWeightMark /> : null}
    </span>
  );
}

export function WeightSummary({ contributor }: { contributor: MeasurementContributor }) {
  const { t, i18n } = useTranslation("admin");
  const note = getEffectiveWeightNote(t, i18n.language, contributor);

  return (
    <div className="min-w-0">
      <ComputedWeight weight={contributor.weight.computed} />
      {note === null ? null : <span className={SECOND_LINE_CLASS}>{note}</span>}
    </div>
  );
}

export function ShareValue({ value }: { value: number | null }) {
  const { i18n } = useTranslation();
  if (value === null) return <EmptyValue />;
  return <span className="tabular-nums">{formatShare(value, i18n.language)}</span>;
}

export function TrustBadges({ contributor }: { contributor: MeasurementContributor }) {
  const { t } = useTranslation("admin");
  const { vouch, block } = contributor;

  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1">
      {block === null ? null : <BlockBadge>{t("measurements.contributors.blocked")}</BlockBadge>}
      {vouch === null ? null : <VouchBadge weight={vouch.weight} />}
    </span>
  );
}

export function TrustSummary({ contributor }: { contributor: MeasurementContributor }) {
  const { t, i18n } = useTranslation("admin");
  const { vouch, block } = contributor;
  if (vouch === null && block === null) return <EmptyValue />;

  let note = "";
  if (block !== null) note = getUntilLabel(t, i18n.language, block.endsAt);
  else if (vouch !== null) {
    const until = getUntilLabel(t, i18n.language, vouch.endsAt);
    note = vouch.confirmsAlone ? t("measurements.contributors.confirmsAlone", { until }) : until;
  }

  return (
    <div className="min-w-0">
      <TrustBadges contributor={contributor} />
      <span className={cn("mt-0.5", SECOND_LINE_CLASS)}>{note}</span>
    </div>
  );
}

export function FirstUploadSummary({ row }: { row: ContributorListRow }) {
  const { t, i18n } = useTranslation("admin");
  const { contributor, currentTermsVersion } = row;
  const terms = getTermsNote(t, contributor.termsVersion, currentTermsVersion);

  return (
    <div className="min-w-0">
      {contributor.firstUploadAt === null ? (
        <span className="block truncate text-muted-foreground">{t("measurements.contributors.noUploads")}</span>
      ) : (
        <span className="block truncate tabular-nums">{formatShortDate(contributor.firstUploadAt, i18n.language)}</span>
      )}
      <span className={cn("block truncate text-xs", terms.isOutdated ? LOW_WEIGHT_TEXT_CLASS : "text-muted-foreground")}>{terms.text}</span>
    </div>
  );
}
