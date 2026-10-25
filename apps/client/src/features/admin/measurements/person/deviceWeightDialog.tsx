import type { MeasurementDevice, MeasurementDeviceUpdate, MeasurementDeviceWeight } from "@openbts/shared/contract";
import { type FormEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { DESTRUCTIVE_GHOST_CLASS } from "../components/classNames";
import { DialogCheckbox } from "../components/dialogCheckbox";
import { REASON_MAX_LENGTH } from "../components/reasonDialog";
import { formatWeight } from "../utils/format";
import { parseTrustWeight } from "./trustInputs";
import { TrustWeightField } from "./trustWeightField";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useOpeningCount } from "@/features/admin/reference/components/shared/useOpeningCount";
import { measurementDeviceName } from "@/features/settings/measurementQueries";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";
import { cn } from "@/lib/utils";

type DeviceWeightDialogProps = {
  device: MeasurementDevice;
  weight: MeasurementDeviceWeight;
  open: boolean;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (change: MeasurementDeviceUpdate) => void;
};

type DeviceWeightFormProps = Omit<DeviceWeightDialogProps, "open" | "onOpenChange"> & { onCancel: () => void };

function DeviceWeightForm({ device, weight, isPending, onCancel, onSubmit }: DeviceWeightFormProps) {
  const { t, i18n } = useTranslation("admin");
  const reasonId = useId();
  const { own } = weight;
  const [weightText, setWeightText] = useState(() => (own === null ? "" : formatWeight(own.value, i18n.language)));
  const [reason, setReason] = useState(own?.reason ?? "");
  const [isRefoldChosen, setIsRefoldChosen] = useState(false);

  const value = parseTrustWeight(weightText);
  const trimmedReason = reason.trim();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (value === null || trimmedReason === "" || isPending) return;
    onSubmit({ weight: { value, reason: trimmedReason }, refold: isRefoldChosen });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{t("measurements.person.deviceWeightDialog.title")}</DialogTitle>
        <DialogDescription>
          {t("measurements.person.deviceWeightDialog.description", {
            name: measurementDeviceName(device),
            weight: formatWeight(weight.computed, i18n.language),
          })}
        </DialogDescription>
      </DialogHeader>
      <TrustWeightField
        value={weightText}
        hint={t("measurements.person.deviceWeightDialog.weightHint")}
        isInvalid={weightText.trim() !== "" && value === null}
        disabled={isPending}
        onChange={setWeightText}
      />
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
      </Field>
      <DialogCheckbox
        label={t("measurements.person.deviceWeightDialog.refold")}
        description={t("measurements.person.deviceWeightDialog.refoldHint")}
        checked={isRefoldChosen}
        disabled={isPending}
        onCheckedChange={setIsRefoldChosen}
      />
      <DialogFooter>
        {own === null ? null : (
          <Button
            type="button"
            variant="ghost"
            className={cn(DESTRUCTIVE_GHOST_CLASS, "sm:mr-auto")}
            disabled={isPending}
            onClick={() => onSubmit({ weight: null, refold: isRefoldChosen })}
          >
            {t("measurements.person.deviceWeightDialog.remove")}
          </Button>
        )}
        <Button type="button" variant="outline" className="cursor-pointer" disabled={isPending} onClick={onCancel}>
          {t("common:actions.cancel")}
        </Button>
        <Button type="submit" className="cursor-pointer" disabled={value === null || trimmedReason === "" || isPending}>
          {isPending ? <Spinner /> : null}
          {t("common:actions.save")}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function DeviceWeightDialog({ open, onOpenChange, ...formProps }: DeviceWeightDialogProps) {
  const openingCount = useOpeningCount(open);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!formProps.isPending) onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DeviceWeightForm key={openingCount} {...formProps} onCancel={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
