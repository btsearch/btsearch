import { HardDriveIcon } from "@hugeicons/core-free-icons";
import type { SettingsMeasurements } from "@openbts/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useMeasurementForm } from "../../hooks/useMeasurementForm";
import { BYTES_PER_GIB, type MeasurementField, parseFieldValue } from "../../utils/measurementSettings";
import { MeasurementFormCard } from "./measurementFormCard";
import { MeasurementNumberField } from "./measurementNumberField";
import { engineStateQueryOptions } from "@/features/admin/measurements/api/engine";
import { ConfirmDialog } from "@/features/settings/components/confirmDialog";
import { UsageMeter } from "@/features/settings/components/settingsPrimitives";
import { formatFileSize } from "@/lib/format";

type RetentionConfirmation = {
  isOpen: boolean;
  days: number;
};

const FILE_FIELDS = ["rawRetentionDays", "rawStorageBudgetGib"] as const satisfies readonly MeasurementField[];
const STORAGE_WARNING_SHARE = 0.9;

export function UploadFilesCard({ measurements }: { measurements: SettingsMeasurements }) {
  const { t } = useTranslation("admin");
  const form = useMeasurementForm(measurements, FILE_FIELDS);
  const [confirmation, setConfirmation] = useState<RetentionConfirmation | null>(null);
  const { data: engine } = useQuery({ ...engineStateQueryOptions(), refetchInterval: false });

  const storedBytes = engine?.storage.storedBytes;
  const budgetGib = parseFieldValue("rawStorageBudgetGib", form.readText("rawStorageBudgetGib")) ?? measurements.rawStorageBudgetGib;
  const isBudgetBelowStored = storedBytes !== undefined && budgetGib * BYTES_PER_GIB < storedBytes;

  function submit() {
    const days = form.draft.changes.rawRetentionDays;
    if (days !== undefined && days < measurements.rawRetentionDays) setConfirmation({ isOpen: true, days });
    else form.saveDraft();
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
        icon={HardDriveIcon}
        title={t("settings.measurements.files.title")}
        description={t("settings.measurements.files.description")}
        isDirty={form.draft.isDirty}
        isSaving={form.isSaving}
        canSave={form.canSave}
        onRevert={form.revert}
        onSubmit={submit}
      >
        <MeasurementNumberField
          field="rawRetentionDays"
          label={t("settings.measurements.files.retention.label")}
          unit={t("settings.measurements.files.retention.unit")}
          hint={t("settings.measurements.files.retention.hint")}
          text={form.readText("rawRetentionDays")}
          onTextChange={(text) => form.editField("rawRetentionDays", text)}
        />
        <MeasurementNumberField
          field="rawStorageBudgetGib"
          label={t("settings.measurements.files.budget.label")}
          unit={t("settings.measurements.files.budget.unit")}
          hint={t("settings.measurements.files.budget.hint")}
          warning={isBudgetBelowStored ? t("settings.measurements.files.budget.belowStored", { size: formatFileSize(storedBytes) }) : null}
          text={form.readText("rawStorageBudgetGib")}
          onTextChange={(text) => form.editField("rawStorageBudgetGib", text)}
        />
        {storedBytes === undefined ? null : (
          <div className="@md:col-span-2">
            <UsageMeter
              label={t("settings.measurements.files.stored")}
              usage={{ used: storedBytes, max: budgetGib * BYTES_PER_GIB }}
              format={formatFileSize}
              warnAbove={STORAGE_WARNING_SHARE}
            />
          </div>
        )}
      </MeasurementFormCard>
      {confirmation === null ? null : (
        <ConfirmDialog
          open={confirmation.isOpen}
          onOpenChange={closeConfirmation}
          title={t("settings.measurements.files.confirm.title")}
          description={t("settings.measurements.files.confirm.description", { count: confirmation.days })}
          confirmLabel={t("settings.measurements.files.confirm.action")}
          onConfirm={confirmSave}
        />
      )}
    </>
  );
}
