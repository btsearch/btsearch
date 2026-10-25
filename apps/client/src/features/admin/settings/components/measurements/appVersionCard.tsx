import { LegalDocument01Icon } from "@hugeicons/core-free-icons";
import type { SettingsMeasurements } from "@openbts/shared/contract";
import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useMeasurementForm } from "../../hooks/useMeasurementForm";
import type { MeasurementField } from "../../utils/measurementSettings";
import { MeasurementFormCard } from "./measurementFormCard";
import { MeasurementNumberField } from "./measurementNumberField";
import { ConfirmDialog } from "@/features/settings/components/confirmDialog";

type RaiseConfirmation = {
  isOpen: boolean;
  minAppVersionCode: number | null;
  termsVersion: number | null;
};

const APP_FIELDS = ["minAppVersionCode", "termsVersion"] as const satisfies readonly MeasurementField[];

function readRaisedValue(value: number | undefined, saved: number): number | null {
  return value !== undefined && value > saved ? value : null;
}

function readConfirmationTitle(t: TFunction, { minAppVersionCode, termsVersion }: RaiseConfirmation): string {
  if (minAppVersionCode !== null && termsVersion !== null) return t("settings.measurements.app.confirm.bothTitle");
  return minAppVersionCode !== null ? t("settings.measurements.app.confirm.versionTitle") : t("settings.measurements.app.confirm.termsTitle");
}

function readConfirmationText(t: TFunction, { minAppVersionCode, termsVersion }: RaiseConfirmation): string {
  const sentences: string[] = [];
  if (minAppVersionCode !== null) sentences.push(t("settings.measurements.app.confirm.version", { version: minAppVersionCode }));
  if (termsVersion !== null) sentences.push(t("settings.measurements.app.confirm.terms", { version: termsVersion }));
  return sentences.join(". ");
}

export function AppVersionCard({ measurements }: { measurements: SettingsMeasurements }) {
  const { t } = useTranslation("admin");
  const form = useMeasurementForm(measurements, APP_FIELDS);
  const [confirmation, setConfirmation] = useState<RaiseConfirmation | null>(null);

  function submit() {
    const minAppVersionCode = readRaisedValue(form.draft.changes.minAppVersionCode, measurements.minAppVersionCode);
    const termsVersion = readRaisedValue(form.draft.changes.termsVersion, measurements.termsVersion);
    if (minAppVersionCode === null && termsVersion === null) form.saveDraft();
    else setConfirmation({ isOpen: true, minAppVersionCode, termsVersion });
  }

  function closeConfirmation() {
    setConfirmation((current) => (current === null ? null : { ...current, isOpen: false }));
  }

  function confirmSave() {
    closeConfirmation();
    form.saveDraft();
  }

  return (
    <>
      <MeasurementFormCard
        icon={LegalDocument01Icon}
        title={t("settings.measurements.app.title")}
        description={t("settings.measurements.app.description")}
        isDirty={form.draft.isDirty}
        isSaving={form.isSaving}
        canSave={form.canSave}
        onRevert={form.revert}
        onSubmit={submit}
      >
        <MeasurementNumberField
          field="minAppVersionCode"
          label={t("settings.measurements.app.minVersion.label")}
          unit={t("settings.measurements.app.minVersion.unit")}
          hint={t("settings.measurements.app.minVersion.hint")}
          text={form.readText("minAppVersionCode")}
          onTextChange={(text) => form.editField("minAppVersionCode", text)}
        />
        <MeasurementNumberField
          field="termsVersion"
          label={t("settings.measurements.app.terms.label")}
          hint={t("settings.measurements.app.terms.hint")}
          text={form.readText("termsVersion")}
          onTextChange={(text) => form.editField("termsVersion", text)}
        />
      </MeasurementFormCard>
      {confirmation === null ? null : (
        <ConfirmDialog
          open={confirmation.isOpen}
          onOpenChange={closeConfirmation}
          title={readConfirmationTitle(t, confirmation)}
          description={readConfirmationText(t, confirmation)}
          confirmLabel={t("common:actions.save")}
          onConfirm={confirmSave}
          destructive={false}
        />
      )}
    </>
  );
}
