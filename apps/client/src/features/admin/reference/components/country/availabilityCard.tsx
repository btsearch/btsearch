import { LockIcon, SentIcon, ViewIcon, ViewOffIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ContributionMode, Country } from "../../types";
import { CountryContributionsBadge, CountryVisibilityBadge } from "../countries/countryStatusBadges";
import { ConfirmDialog, ReferenceCard, ReferenceCardHeader, ReferenceCardNote, ReferenceRow, SegmentedControl } from "../shared/referenceCards";
import { useCountryAvailability } from "./useCountryAvailability";
import { Switch } from "@/components/ui/switch";
import { getCountryName } from "@/lib/geo/countryName";

type AvailabilityCardProps = {
  country: Country;
  canEdit: boolean;
};

type AvailabilityFrameProps = {
  visibilityTitleId?: string;
  contributionsTitleId?: string;
  visibilityControl: ReactNode;
  contributionsControl: ReactNode;
  note: ReactNode;
  children?: ReactNode;
};

function AvailabilityFrame({
  visibilityTitleId,
  contributionsTitleId,
  visibilityControl,
  contributionsControl,
  note,
  children,
}: AvailabilityFrameProps) {
  const { t } = useTranslation("admin");

  return (
    <ReferenceCard>
      <ReferenceCardHeader
        title={t("reference.country.general.availability.title")}
        description={t("reference.country.general.availability.description")}
      />
      <div className="border-t">
        <ReferenceRow
          icon={ViewIcon}
          title={t("reference.country.general.availability.visible.title")}
          titleId={visibilityTitleId}
          description={t("reference.country.general.availability.visible.description")}
        >
          {visibilityControl}
        </ReferenceRow>
        <ReferenceRow
          icon={SentIcon}
          title={t("common:labels.submissions")}
          titleId={contributionsTitleId}
          description={t("reference.country.general.availability.contributions.description")}
          wrap
        >
          {contributionsControl}
        </ReferenceRow>
      </div>
      {note}
      {children}
    </ReferenceCard>
  );
}

function EditableAvailabilityCard({ country }: { country: Country }) {
  const { t, i18n } = useTranslation("admin");
  const visibilityTitleId = useId();
  const contributionsTitleId = useId();
  const [isHideConfirmOpen, setIsHideConfirmOpen] = useState(false);
  const availability = useCountryAvailability(country.code);

  const contributionOptions: { value: ContributionMode; label: string }[] = [
    { value: "closed", label: t("reference.countries.contributions.closed") },
    { value: "open", label: t("reference.countries.contributions.open") },
  ];

  function changeVisibility(isVisible: boolean) {
    if (isVisible) availability.mutate({ isVisible: true });
    else setIsHideConfirmOpen(true);
  }

  function hideCountry() {
    availability.mutate({ isVisible: false }, { onSuccess: () => setIsHideConfirmOpen(false) });
  }

  return (
    <AvailabilityFrame
      visibilityTitleId={visibilityTitleId}
      contributionsTitleId={contributionsTitleId}
      visibilityControl={
        <Switch
          checked={country.isVisible}
          disabled={availability.isPending}
          aria-labelledby={visibilityTitleId}
          onCheckedChange={changeVisibility}
          className="cursor-pointer"
        />
      }
      contributionsControl={
        <SegmentedControl
          value={country.contributions}
          options={contributionOptions}
          onValueChange={(contributions) => availability.mutate({ contributions })}
          ariaLabelledBy={contributionsTitleId}
          disabled={availability.isPending}
        />
      }
      note={<ReferenceCardNote className="mt-auto">{t("reference.country.general.availability.note")}</ReferenceCardNote>}
    >
      <ConfirmDialog
        open={isHideConfirmOpen}
        onOpenChange={(open) => {
          if (!availability.isPending) setIsHideConfirmOpen(open);
        }}
        title={t("reference.country.general.availability.hideConfirm.title")}
        description={t("reference.country.general.availability.hideConfirm.description", {
          name: getCountryName(country.code, i18n.language),
        })}
        confirmLabel={
          <>
            {availability.isPending ? null : <HugeiconsIcon icon={ViewOffIcon} data-icon="inline-start" aria-hidden="true" />}
            {t("reference.country.general.availability.hideConfirm.confirm")}
          </>
        }
        pending={availability.isPending}
        onConfirm={hideCountry}
      />
    </AvailabilityFrame>
  );
}

function ReadOnlyAvailabilityCard({ country }: { country: Country }) {
  const { t } = useTranslation("admin");

  return (
    <AvailabilityFrame
      visibilityControl={<CountryVisibilityBadge isVisible={country.isVisible} />}
      contributionsControl={<CountryContributionsBadge contributions={country.contributions} />}
      note={
        <ReferenceCardNote icon={LockIcon} className="mt-auto">
          {t("reference.country.general.readOnlyNote")}
        </ReferenceCardNote>
      }
    />
  );
}

export function AvailabilityCard({ country, canEdit }: AvailabilityCardProps) {
  if (canEdit) return <EditableAvailabilityCard country={country} />;
  return <ReadOnlyAvailabilityCard country={country} />;
}
