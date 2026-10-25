import { BalanceScaleIcon } from "@hugeicons/core-free-icons";
import type { MeasurementContributor, MeasurementDevice } from "@openbts/shared/contract";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { personDevicesQueryOptions } from "../api/contributors";
import { LOW_WEIGHT_TEXT_CLASS, LowWeightMark, isLowWeight } from "../contributors/contributorBadges";
import { formatCount, formatShare, formatWeight } from "../utils/format";
import { EmptyValue } from "@/components/ui/emptyValue";
import { SettingsCard, SettingsCardHeader, SettingsCardNote } from "@/features/settings/components/settingsPrimitives";
import { cn } from "@/lib/utils";

type PersonWeightBasis = "computed" | "vouch" | "device" | "vouchAndDevice";

type WeightFigureProps = {
  label: string;
  value: number;
  note?: string | null;
  isLowMarked?: boolean;
};

function getPersonWeightBasis(devices: readonly MeasurementDevice[]): PersonWeightBasis {
  const bases = new Set(devices.map((device) => device.weight?.basis));
  if (bases.has("vouch")) return bases.has("device") ? "vouchAndDevice" : "vouch";
  return bases.has("device") ? "device" : "computed";
}

function WeightFigure({ label, value, note = null, isLowMarked = false }: WeightFigureProps) {
  const { i18n } = useTranslation();
  const isLow = isLowMarked && isLowWeight(value);

  return (
    <div className="min-w-0">
      <p className="text-xs leading-4 text-muted-foreground">{label}</p>
      <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
        <span className={cn("inline-flex items-center gap-1.5 text-2xl leading-8 font-bold tabular-nums", isLow && LOW_WEIGHT_TEXT_CLASS)}>
          {formatWeight(value, i18n.language)}
          {isLow ? <LowWeightMark className="size-4" /> : null}
        </span>
        {note === null ? null : <span className="text-[0.8125rem] leading-[1.125rem] text-muted-foreground">{note}</span>}
      </p>
    </div>
  );
}

function TrackRecordRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 py-[7px] sm:px-5">
      <dt className="text-[13px] leading-5 text-muted-foreground">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums">{children}</dd>
    </div>
  );
}

export function WeightCard({ contributor }: { contributor: MeasurementContributor }) {
  const { t, i18n } = useTranslation("admin");
  const { data: devices } = useQuery(personDevicesQueryOptions(contributor.user.id));
  const { weight, trackRecord } = contributor;
  const basis = devices === undefined ? null : getPersonWeightBasis(devices);

  return (
    <SettingsCard>
      <SettingsCardHeader icon={BalanceScaleIcon} title={t("measurements.weight")} description={t("measurements.person.weight.description")} />
      <div className="grid grid-cols-2 gap-4 border-t px-4 py-3.5 sm:px-5">
        <WeightFigure label={t("measurements.person.weight.computed")} value={weight.computed} isLowMarked />
        <WeightFigure
          label={t("measurements.person.weight.effective")}
          value={weight.effective}
          note={basis === null ? null : t(`measurements.person.weight.basis.${basis}`)}
        />
      </div>
      <dl className="border-t pt-[5px] pb-[9px]">
        <TrackRecordRow label={t("measurements.person.weight.timingAdvance")}>
          {trackRecord.timingAdvanceAgreement === null ? <EmptyValue /> : formatShare(trackRecord.timingAdvanceAgreement, i18n.language)}
        </TrackRecordRow>
        <TrackRecordRow label={t("measurements.person.weight.dropped")}>{formatShare(trackRecord.droppedShare, i18n.language)}</TrackRecordRow>
        <TrackRecordRow label={t("measurements.contributors.columns.mock")}>{formatShare(trackRecord.mockShare, i18n.language)}</TrackRecordRow>
        <TrackRecordRow label={t("measurements.contributors.columns.phantom")}>{formatCount(trackRecord.phantomCells, i18n.language)}</TrackRecordRow>
      </dl>
      <SettingsCardNote className="mt-auto">{t("measurements.person.weight.note")}</SettingsCardNote>
    </SettingsCard>
  );
}
