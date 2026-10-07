import type { CellPatch } from "./draftReducer";
import { getCellNumber } from "./ratFields";
import type { CellDraft, EditError } from "./types";

export function getUnavailableCodePatch(cell: CellDraft, errors: readonly EditError[]): CellPatch | null {
  let field: "psc" | "bsic";
  if (cell.rat === "umts") field = "psc";
  else if (cell.rat === "gsm") field = "bsic";
  else return null;
  if (getCellNumber(cell, field) === null) return null;

  const hasUnavailableCode = errors.some(
    (error) =>
      error.messageKey === "stations:edit.errors.codeDisabled" &&
      error.target.scope === "cell" &&
      error.target.key === cell.key &&
      error.target.field === field,
  );
  return hasUnavailableCode ? { numbers: { [field]: null } } : null;
}
