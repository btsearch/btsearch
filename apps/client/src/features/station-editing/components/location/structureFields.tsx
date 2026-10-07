import { type StationDraftApi, useEditText } from "../../hooks/useStationDraft";
import { getFieldState } from "../../model/changes";
import type { EditError, FieldTarget, PlaceField, StructureDraft } from "../../model/types";
import { findFieldError } from "../../model/validate";
import { editTargetProps } from "../frame/editTargets";
import { getFieldLook } from "../frame/fieldLook";
import { FieldMarks } from "../frame/wasLine";
import { PICKER_NOTE_CLASS } from "@/features/shared/location/fieldClasses";
import { LocationStructureFields, type StructureFieldPresentation } from "@/features/shared/location/structureFields";
import { buildStructureOwnerOptions } from "@/features/shared/location/structureOwners";
import { useEditorArea } from "@/features/stations/list/data/editorArea";

type StructureFieldsProps = {
  edit: StationDraftApi;
};

const NO_STRUCTURE: StructureDraft = { type: null, owner: { kind: "unknown" }, note: "" };

function buildStructurePresentation(edit: StationDraftApi, field: PlaceField, formatError: (error: EditError) => string): StructureFieldPresentation {
  const target: FieldTarget = { scope: "place", field };
  const state = getFieldState(edit.session, edit.context, target);
  const error = findFieldError(edit.errors, target);
  const showsMarks = edit.session.kind === "review";

  return {
    error: error === undefined ? undefined : formatError(error),
    tone: getFieldLook(state, showsMarks),
    attributes: editTargetProps(target),
    notes: showsMarks ? <FieldMarks marks={state.marks} className={PICKER_NOTE_CLASS} /> : null,
  };
}

export function StructureFields({ edit }: StructureFieldsProps) {
  const text = useEditText();
  const { session, dispatch, lookups, canEdit } = edit;
  const { area } = useEditorArea(session.kind !== "form");
  const structure = session.draft.place?.structure ?? NO_STRUCTURE;
  const submittedOwner = session.proposed?.place?.structure.owner;
  const ownerOptions = buildStructureOwnerOptions({
    owners: lookups.owners,
    brands: lookups.brands,
    operators: lookups.operators,
    value: structure.owner,
    countryCode: lookups.countryCode,
    area,
    proposesOwner: session.kind === "form",
    allowsOwnerProposals: lookups.countryFeatures?.structureOwnerProposals === true,
    submittedName: submittedOwner?.kind === "proposed" ? submittedOwner.name : null,
  });

  function changeStructure(patch: Partial<StructureDraft>) {
    const { owner, ...structurePatch } = patch;
    if (owner !== undefined) dispatch({ type: "setOwner", owner });
    if (Object.keys(structurePatch).length > 0) dispatch({ type: "setStructure", patch: structurePatch });
  }

  return (
    <LocationStructureFields
      value={structure}
      onChange={changeStructure}
      ownerOptions={ownerOptions}
      isDisabled={!canEdit}
      presentations={{
        type: buildStructurePresentation(edit, "structureType", text.formatError),
        owner: buildStructurePresentation(edit, "structureOwner", text.formatError),
        note: buildStructurePresentation(edit, "structureNote", text.formatError),
      }}
    />
  );
}
