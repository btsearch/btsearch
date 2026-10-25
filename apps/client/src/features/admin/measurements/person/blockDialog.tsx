import type { MeasurementContributor } from "@openbts/shared/contract";
import { type FormEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { DialogCheckbox } from "../components/dialogCheckbox";
import { REASON_MAX_LENGTH } from "../components/reasonDialog";
import { BLOCK_DURATIONS, computeEndsAt, pickDuration } from "./trustInputs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useOpeningCount } from "@/features/admin/reference/components/shared/useOpeningCount";
import { type BanDurationId, getBanDurationLabel } from "@/features/admin/users/utils/ban";
import { SegmentedControl } from "@/features/settings/components/settingsPrimitives";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";
import { formatFullDate } from "@/lib/format";

export type BlockRequest = {
  reason: string;
  endsAt: string | null;
  isExcludingUploads: boolean;
};

type BlockDialogProps = {
  contributor: MeasurementContributor;
  open: boolean;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (request: BlockRequest) => void;
};

type BlockFormProps = Omit<BlockDialogProps, "open" | "onOpenChange"> & { onCancel: () => void };

const DEFAULT_BLOCK_DURATION = BLOCK_DURATIONS[1];

function BlockForm({ contributor, isPending, onCancel, onSubmit }: BlockFormProps) {
  const { t, i18n } = useTranslation("admin");
  const { block } = contributor;
  const reasonId = useId();
  const durationTitleId = useId();
  const [openedAt] = useState(Date.now);
  const [reason, setReason] = useState(block?.reason ?? "");
  const [durationId, setDurationId] = useState<BanDurationId>(() => pickDuration(BLOCK_DURATIONS, block, DEFAULT_BLOCK_DURATION).id);
  const [isExcludingUploads, setIsExcludingUploads] = useState(false);

  const trimmedReason = reason.trim();
  const duration = BLOCK_DURATIONS.find((candidate) => candidate.id === durationId) ?? DEFAULT_BLOCK_DURATION;
  const endsAt = computeEndsAt(duration, openedAt);
  const durationOptions = BLOCK_DURATIONS.map((candidate) => ({ value: candidate.id, label: getBanDurationLabel(t, candidate.id) }));
  const isChange = block !== null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (trimmedReason === "" || isPending) return;
    onSubmit({ reason: trimmedReason, endsAt, isExcludingUploads });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{isChange ? t("measurements.person.blockDialog.changeTitle") : t("measurements.person.blockDialog.title")}</DialogTitle>
        <DialogDescription>{t("measurements.person.blockDialog.description")}</DialogDescription>
      </DialogHeader>
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
        <FieldDescription>
          {isExcludingUploads ? t("measurements.person.blockDialog.reasonHintWithExclusion") : t("measurements.person.auditReasonHint")}
        </FieldDescription>
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
            ? t("measurements.person.blockDialog.noExpiry")
            : t("measurements.person.blockDialog.expiresAt", { date: formatFullDate(endsAt, i18n.language) })}
        </FieldDescription>
      </Field>
      <DialogCheckbox
        label={t("measurements.person.blockDialog.excludeUploads")}
        description={t("measurements.person.excludeHint")}
        checked={isExcludingUploads}
        disabled={isPending}
        onCheckedChange={setIsExcludingUploads}
      />
      <DialogFooter>
        <Button type="button" variant="outline" className="cursor-pointer" disabled={isPending} onClick={onCancel}>
          {t("common:actions.cancel")}
        </Button>
        <Button type="submit" variant={isChange ? "default" : "destructive"} className="cursor-pointer" disabled={trimmedReason === "" || isPending}>
          {isPending ? <Spinner /> : null}
          {isChange ? t("common:actions.save") : t("measurements.block")}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function BlockDialog({ open, onOpenChange, ...formProps }: BlockDialogProps) {
  const openingCount = useOpeningCount(open);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!formProps.isPending) onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <BlockForm key={openingCount} {...formProps} onCancel={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
