import { Note01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useId } from "react";

import { CELL_CONTROL_PROPS } from "../../hooks/useCellNavigation";
import type { DraftDispatch } from "../../model/draftReducer";
import type { DraftKey, FieldMark } from "../../model/types";
import { FieldCell, ROW_INPUT_CLASS } from "./cellFields";
import type { CellTexts } from "./cellTexts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";
import { cn } from "@/lib/utils";

type CellNoteProps = {
  cellKey: DraftKey;
  note: string;
  marks?: readonly FieldMark[];
  texts: CellTexts;
  className: string;
  isLocked: boolean;
  dispatch: DraftDispatch;
};

type NoteEditorProps = {
  note: string;
  texts: CellTexts;
  isLocked: boolean;
  onChange: (note: string) => void;
};

const NOTE_FIELD = "notes";
const FIELD_SLOT_CLASS = "hidden flex-1 @[206px]/tail:block";
const ICON_SLOT_CLASS = "@[206px]/tail:hidden";

function NoteEditor({ note, texts, isLocked, onChange }: NoteEditorProps) {
  const inputId = useId();

  return (
    <>
      <label htmlFor={inputId} className="text-xs font-medium text-muted-foreground">
        {texts.note}
      </label>
      <Input
        id={inputId}
        type="text"
        {...NO_AUTOFILL_PROPS}
        value={note}
        onChange={(event) => onChange(event.target.value)}
        placeholder={texts.notePlaceholder}
        disabled={isLocked}
      />
    </>
  );
}

export function CellNote({ cellKey, note, marks, texts, className, isLocked, dispatch }: CellNoteProps) {
  const hasNote = note.trim() !== "";
  const iconLabel = hasNote ? `${texts.note}: ${note}` : texts.addNote;
  const iconButton = (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className={cn("cursor-pointer", hasNote ? "bg-primary/10 text-primary" : "text-muted-foreground")}
      {...CELL_CONTROL_PROPS}
    />
  );

  function changeNote(nextNote: string) {
    dispatch({ type: "setCell", key: cellKey, patch: { notes: nextNote } });
  }

  return (
    <>
      <FieldCell field={NOTE_FIELD} marks={marks} className={FIELD_SLOT_CLASS}>
        <Input
          type="text"
          {...NO_AUTOFILL_PROPS}
          {...CELL_CONTROL_PROPS}
          aria-label={texts.note}
          value={note}
          onChange={(event) => changeNote(event.target.value)}
          placeholder={texts.notePlaceholder}
          disabled={isLocked}
          className={cn(ROW_INPUT_CLASS, className)}
        />
      </FieldCell>
      <FieldCell field={NOTE_FIELD} className={ICON_SLOT_CLASS}>
        <Popover>
          <Tooltip>
            <TooltipTrigger aria-label={iconLabel} render={<PopoverTrigger render={iconButton} disabled={isLocked && !hasNote} />}>
              <HugeiconsIcon icon={Note01Icon} aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent className="max-w-64 wrap-break-word">{iconLabel}</TooltipContent>
          </Tooltip>
          <PopoverContent align="end" className="w-64 gap-1.5">
            <NoteEditor note={note} texts={texts} isLocked={isLocked} onChange={changeNote} />
          </PopoverContent>
        </Popover>
      </FieldCell>
    </>
  );
}
