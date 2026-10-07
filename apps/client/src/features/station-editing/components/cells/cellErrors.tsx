import type { DraftDispatch } from "../../model/draftReducer";
import type { CellDraft, EditError } from "../../model/types";
import { getUnavailableCodePatch } from "../../model/unavailableCodes";
import { ErrorLine } from "./cellFields";
import type { CellTexts } from "./cellTexts";
import { Button } from "@/components/ui/button";

type CellErrorsProps = {
  cell: CellDraft;
  errors: readonly EditError[];
  texts: CellTexts;
  isLocked: boolean;
  dispatch: DraftDispatch;
  className?: string;
};

export function CellErrors({ cell, errors, texts, isLocked, dispatch, className }: CellErrorsProps) {
  if (errors.length === 0) return null;
  const patch = isLocked ? null : getUnavailableCodePatch(cell, errors);

  return (
    <div className={className}>
      <ErrorLine errors={errors} />
      {patch === null ? null : (
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <Button
            type="button"
            variant="link"
            size="xs"
            className="-ml-2 cursor-pointer text-xs"
            onClick={() => dispatch({ type: "setCell", key: cell.key, patch })}
          >
            {texts.resetUnavailableCodes}
          </Button>
          {cell.id === null ? null : <span className="text-xs text-muted-foreground">{texts.savedCodesUnchanged}</span>}
        </div>
      )}
    </div>
  );
}
