import type { SettingsMeasurements } from "@openbts/shared/contract";
import { useState } from "react";

import { type MeasurementEdits, type MeasurementField, dropSubmittedEdits, readFieldText, readMeasurementDraft } from "../utils/measurementSettings";
import { useSettingsSave } from "./useSettingsSave";
import { hasChanges } from "@/features/admin/reference/utils/diff";

export function useMeasurementForm(saved: SettingsMeasurements, fields: readonly MeasurementField[]) {
  const [edits, setEdits] = useState<MeasurementEdits>({});
  const save = useSettingsSave({ isOptimistic: false });
  const draft = readMeasurementDraft(saved, edits, fields);
  const isSaving = save.isPending;

  function readText(field: MeasurementField): string {
    return readFieldText(saved, edits, field);
  }

  function editField(field: MeasurementField, text: string) {
    setEdits((current) => ({ ...current, [field]: text }));
  }

  function saveDraft() {
    const submitted = edits;
    if (!hasChanges(draft.changes)) {
      setEdits({});
      return;
    }
    save.mutate({ measurements: draft.changes }, { onSuccess: () => setEdits((current) => dropSubmittedEdits(current, submitted, fields)) });
  }

  return {
    draft,
    isSaving,
    canSave: draft.isDirty && !draft.isInvalid && !isSaving,
    readText,
    editField,
    revert: () => setEdits({}),
    saveDraft,
  };
}
