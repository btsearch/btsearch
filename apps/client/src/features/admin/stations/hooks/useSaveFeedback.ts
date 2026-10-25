import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { RevealField } from "../components/editorTopBar";
import { type StationDraftApi, useBlockedSaves, useEditText } from "@/features/station-editing/hooks/useStationDraft";
import { RAT_FIELDS } from "@/features/station-editing/model/ratFields";
import { type BuiltKeys, isServerRefusal, toEditErrors } from "@/features/station-editing/model/serverRefusals";
import type { EditError, EditSession, Rat } from "@/features/station-editing/model/types";
import { showApiError } from "@/lib/api";

function findOnlyTable(errors: readonly EditError[]): Rat | null {
  const firstRat = errors.at(0)?.target.rat ?? null;
  return errors.every((refusal) => (refusal.target.rat ?? null) === firstRat) ? firstRat : null;
}

export function useSaveFeedback(edit: StationDraftApi) {
  const { t } = useTranslation("stations");
  const text = useEditText();
  const { blockedSaves, countBlockedSave, reportBlockedSave } = useBlockedSaves(edit.dispatch);

  function reportFailedSave(error: unknown, built: BuiltKeys, session: EditSession, reveal: RevealField) {
    if (!isServerRefusal(error)) {
      showApiError(error);
      return;
    }

    const errors = toEditErrors(error, built, session);
    const placedErrors = errors.filter((refusal) => refusal.target.scope !== "general");
    const [firstError] = errors;
    const [firstPlacedError] = placedErrors;
    const title = t("edit.editor.saveRefused.title");

    edit.setServerErrors(errors);
    countBlockedSave();
    if (firstPlacedError === undefined) {
      toast.error(title, { description: firstError === undefined ? undefined : text.formatError(firstError) });
      return;
    }

    const table = findOnlyTable(placedErrors);
    toast.error(title, {
      description:
        table === null
          ? t("edit.editor.saveRefused.fields", { count: placedErrors.length })
          : t("edit.editor.saveRefused.fieldsInTable", { count: placedErrors.length, table: RAT_FIELDS[table].name }),
      action: { label: t("edit.editor.saveRefused.show"), onClick: () => reveal(firstPlacedError.target) },
    });
  }

  return { blockedSaves, reportBlockedSave, reportFailedSave };
}
