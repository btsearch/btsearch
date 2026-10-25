import type { MeasurementContributor, MeasurementContributorUpdate } from "@openbts/shared/contract";
import { type FormEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { DialogCheckbox } from "../components/dialogCheckbox";
import { REASON_MAX_LENGTH } from "../components/reasonDialog";
import { formatWeight } from "../utils/format";
import { VOUCH_DURATIONS, computeEndsAt, parseTrustWeight, pickDuration } from "./trustInputs";
import { TrustWeightField } from "./trustWeightField";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useOpeningCount } from "@/features/admin/reference/components/shared/useOpeningCount";
import { SETTINGS_DESCRIPTION_CLASS, SegmentedControl } from "@/features/settings/components/settingsPrimitives";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";
import { formatFullDate } from "@/lib/format";

type VouchDurationId = (typeof VOUCH_DURATIONS)[number]["id"];

type VouchDialogProps = {
  contributor: MeasurementContributor;
  open: boolean;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (change: MeasurementContributorUpdate) => void;
};

type VouchFormProps = Omit<VouchDialogProps, "open" | "onOpenChange"> & { onCancel: () => void };

const DEFAULT_VOUCH_WEIGHT = 1.5;
const DEFAULT_VOUCH_DURATION = VOUCH_DURATIONS[3];

function VouchForm({ contributor, isPending, onCancel, onSubmit }: VouchFormProps) {
  const { t, i18n } = useTranslation("admin");
  const { vouch } = contributor;
  const reasonId = useId();
  const confirmsAloneId = useId();
  const durationTitleId = useId();
  const [openedAt] = useState(Date.now);
  const [weightText, setWeightText] = useState(() => formatWeight(vouch?.weight ?? DEFAULT_VOUCH_WEIGHT, i18n.language));
  const [confirmsAlone, setConfirmsAlone] = useState(vouch?.confirmsAlone ?? false);
  const [reason, setReason] = useState(vouch?.reason ?? "");
  const [durationId, setDurationId] = useState<VouchDurationId>(() => pickDuration(VOUCH_DURATIONS, vouch, DEFAULT_VOUCH_DURATION).id);
  const [isRefoldChosen, setIsRefoldChosen] = useState(vouch === null);

  const weight = parseTrustWeight(weightText);
  const trimmedReason = reason.trim();
  const duration = VOUCH_DURATIONS.find((candidate) => candidate.id === durationId) ?? DEFAULT_VOUCH_DURATION;
  const endsAt = computeEndsAt(duration, openedAt);
  const durationOptions = VOUCH_DURATIONS.map((candidate) => ({ value: candidate.id, label: t(candidate.labelKey) }));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (weight === null || trimmedReason === "" || isPending) return;
    onSubmit({ vouch: { weight, confirmsAlone, reason: trimmedReason, endsAt: endsAt ?? undefined }, refold: isRefoldChosen });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{vouch === null ? t("measurements.person.vouchDialog.title") : t("measurements.person.vouchDialog.changeTitle")}</DialogTitle>
        <DialogDescription>
          {t("measurements.person.vouchDialog.description", { weight: formatWeight(contributor.weight.computed, i18n.language) })}
        </DialogDescription>
      </DialogHeader>
      <TrustWeightField
        value={weightText}
        hint={t("measurements.person.vouchDialog.weightHint")}
        isInvalid={weightText.trim() !== "" && weight === null}
        disabled={isPending}
        onChange={setWeightText}
      />
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p id={confirmsAloneId} className="text-sm leading-5 font-medium">
            {t("measurements.person.confirmsAlone")}
          </p>
          <p className={SETTINGS_DESCRIPTION_CLASS}>{t("measurements.person.vouchDialog.confirmsAloneHint")}</p>
        </div>
        <Switch
          checked={confirmsAlone}
          disabled={isPending}
          onCheckedChange={setConfirmsAlone}
          aria-labelledby={confirmsAloneId}
          className="cursor-pointer"
        />
      </div>
      <Field>
        <FieldLabel htmlFor={reasonId}>{t("measurements.reason")}</FieldLabel>
        <Input
          {...NO_AUTOFILL_PROPS}
          id={reasonId}
          value={reason}
          maxLength={REASON_MAX_LENGTH}
          disabled={isPending}
          required
          onChange={(event) => setReason(event.target.value)}
        />
        <FieldDescription>{t("measurements.person.auditReasonHint")}</FieldDescription>
      </Field>
      <Field>
        <FieldTitle id={durationTitleId}>{t("users.detail.moderation.banDialog.duration")}</FieldTitle>
        <SegmentedControl
          value={durationId}
          options={durationOptions}
          onValueChange={setDurationId}
          ariaLabelledBy={durationTitleId}
          disabled={isPending}
          className="flex w-full *:flex-auto"
        />
        <FieldDescription>
          {endsAt === null
            ? t("measurements.person.vouchDialog.noExpiry")
            : t("measurements.person.vouchDialog.expiresAt", { date: formatFullDate(endsAt, i18n.language) })}
        </FieldDescription>
      </Field>
      <DialogCheckbox
        label={t("measurements.person.vouchDialog.refold")}
        description={t("measurements.person.vouchDialog.refoldHint")}
        checked={isRefoldChosen}
        disabled={isPending}
        onCheckedChange={setIsRefoldChosen}
      />
      <DialogFooter>
        <Button type="button" variant="outline" className="cursor-pointer" disabled={isPending} onClick={onCancel}>
          {t("common:actions.cancel")}
        </Button>
        <Button type="submit" className="cursor-pointer" disabled={weight === null || trimmedReason === "" || isPending}>
          {isPending ? <Spinner /> : null}
          {vouch === null ? t("measurements.person.vouch.action") : t("common:actions.save")}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function VouchDialog({ open, onOpenChange, ...formProps }: VouchDialogProps) {
  const openingCount = useOpeningCount(open);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!formProps.isPending) onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <VouchForm key={openingCount} {...formProps} onCancel={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
