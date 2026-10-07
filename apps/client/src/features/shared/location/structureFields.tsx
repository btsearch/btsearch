import type { StructureType } from "@openbts/shared/contract";
import { type ReactNode, useId } from "react";
import { useTranslation } from "react-i18next";

import { PICKER_FIELD_CLASS } from "./fieldClasses";
import { OwnerPicker } from "./ownerPicker";
import type { StructureOwnerOptions } from "./structureOwners";
import type { StructureDraft } from "./types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StructureTypeIcon } from "@/features/station-details/station/components/structureTypeIcon";
import { getStructureTypeKey } from "@/features/station-details/station/utils/structure";
import { type FieldLook, getFieldClass } from "@/features/station-editing/components/frame/fieldLook";
import { EDIT_LIMITS } from "@/features/station-editing/model/validate";
import { LIST_STRUCTURE_TYPES } from "@/features/stations/list/data/listStructures";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";
import { cn } from "@/lib/utils";

export type StructureFieldPresentation = {
  tone?: FieldLook;
  error?: string;
  notes?: ReactNode;
  attributes?: Record<string, string>;
};

type LocationStructureFieldsProps = {
  value: StructureDraft;
  onChange: (patch: Partial<StructureDraft>) => void;
  ownerOptions: StructureOwnerOptions;
  isDisabled: boolean;
  presentations?: Partial<Record<"type" | "owner" | "note", StructureFieldPresentation>>;
};

type FieldNotesProps = {
  presentation: StructureFieldPresentation;
  errorId: string;
};

const NO_TYPE = "none";
const EMPTY_PRESENTATION: StructureFieldPresentation = {};

function toStructureType(choice: string | null): StructureType | null {
  return LIST_STRUCTURE_TYPES.find((type) => type === choice) ?? null;
}

function getControlClass(presentation: StructureFieldPresentation): string {
  return getFieldClass(presentation.tone ?? "plain", presentation.error !== undefined);
}

function FieldNotes({ presentation, errorId }: FieldNotesProps) {
  return (
    <>
      {presentation.error === undefined ? null : (
        <p id={errorId} className="text-xs text-destructive">
          {presentation.error}
        </p>
      )}
      {presentation.notes}
    </>
  );
}

export function LocationStructureFields({ value: structure, onChange, ownerOptions, isDisabled, presentations }: LocationStructureFieldsProps) {
  const { t } = useTranslation();
  const fieldId = useId();
  const typeLook = presentations?.type ?? EMPTY_PRESENTATION;
  const ownerLook = presentations?.owner ?? EMPTY_PRESENTATION;
  const noteLook = presentations?.note ?? EMPTY_PRESENTATION;
  const unknownLabel = t("common:labels.unknown");
  const typeLabelId = `${fieldId}-type`;
  const ownerLabelId = `${fieldId}-owner`;
  const noteId = `${fieldId}-note`;
  const typeErrorId = `${typeLabelId}-error`;
  const ownerErrorId = `${ownerLabelId}-error`;
  const noteErrorId = `${noteId}-error`;

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className={PICKER_FIELD_CLASS} {...typeLook.attributes}>
          <Label id={typeLabelId} className="text-xs">
            {t("common:structure.type")}
          </Label>
          <Select value={structure.type ?? NO_TYPE} onValueChange={(choice) => onChange({ type: toStructureType(choice) })} disabled={isDisabled}>
            <SelectTrigger
              aria-labelledby={typeLabelId}
              aria-invalid={typeLook.error !== undefined || undefined}
              aria-describedby={typeLook.error === undefined ? undefined : typeErrorId}
              className={cn("h-8 w-full cursor-pointer text-sm", getControlClass(typeLook))}
            >
              <SelectValue>
                {structure.type === null ? (
                  <span className="text-muted-foreground">{unknownLabel}</span>
                ) : (
                  <>
                    <StructureTypeIcon type={structure.type} className="size-4 text-muted-foreground" />
                    <span className="truncate">{t(getStructureTypeKey(structure.type))}</span>
                  </>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_TYPE} className="cursor-pointer text-muted-foreground">
                {unknownLabel}
              </SelectItem>
              {LIST_STRUCTURE_TYPES.map((type) => (
                <SelectItem key={type} value={type} className="cursor-pointer">
                  <StructureTypeIcon type={type} className="size-4 text-muted-foreground" />
                  {t(getStructureTypeKey(type))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldNotes presentation={typeLook} errorId={typeErrorId} />
        </div>
        <div className={PICKER_FIELD_CLASS} {...ownerLook.attributes}>
          <Label id={ownerLabelId} className="text-xs">
            {t("common:structure.owner")}
          </Label>
          <OwnerPicker
            {...ownerOptions}
            value={structure.owner}
            onChange={(owner) => onChange({ owner })}
            labelledBy={ownerLabelId}
            tone={ownerLook.tone ?? "plain"}
            isInvalid={ownerLook.error !== undefined}
            describedBy={ownerLook.error === undefined ? undefined : ownerErrorId}
            isDisabled={isDisabled}
          />
          <FieldNotes presentation={ownerLook} errorId={ownerErrorId} />
        </div>
      </div>
      <div className={PICKER_FIELD_CLASS} {...noteLook.attributes}>
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={noteId} className="text-xs">
            {t("common:structure.note")}
          </Label>
          <span className="text-[11px] leading-3 text-muted-foreground tabular-nums">
            {structure.note.length} / {EDIT_LIMITS.structureNote}
          </span>
        </div>
        <Input
          id={noteId}
          {...NO_AUTOFILL_PROPS}
          placeholder={t("stations:edit.location.structureNotePlaceholder")}
          value={structure.note}
          maxLength={EDIT_LIMITS.structureNote}
          onChange={(event) => onChange({ note: event.target.value })}
          disabled={isDisabled}
          aria-invalid={noteLook.error !== undefined || undefined}
          aria-describedby={noteLook.error === undefined ? undefined : noteErrorId}
          className={cn("h-8 text-sm", getControlClass(noteLook))}
        />
        <FieldNotes presentation={noteLook} errorId={noteErrorId} />
      </div>
    </>
  );
}
