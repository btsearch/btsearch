import { Add01Icon, Building03Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Brand, Operator, StructureOwner } from "@openbts/shared/contract";
import { useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { OwnerNameDialog } from "./ownerNameDialog";
import type { OwnerChoice } from "./types";
import { BrandMark } from "@/components/cellular/brandMark";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import { InputGroupAddon } from "@/components/ui/input-group";
import { structureOwnersQueryOptions } from "@/features/admin/reference/api/structureOwners";
import { StructureOwnerDialog } from "@/features/admin/reference/components/owners/structureOwnerDialog";
import { getStructureOwnerBrand } from "@/features/station-details/station/utils/structure";
import { type FieldLook, getFieldClass } from "@/features/station-editing/components/frame/fieldLook";
import { EDIT_LIMITS } from "@/features/station-editing/model/validate";
import { foldText } from "@/lib/foldText";
import { cn } from "@/lib/utils";

export type OwnerCreation = "create" | "propose" | "none";

export type OwnerPickerProps = {
  value: OwnerChoice;
  onChange: (owner: OwnerChoice) => void;
  owners: readonly StructureOwner[];
  selectedOwner: StructureOwner | null;
  brands: readonly Brand[];
  operators: readonly Operator[];
  creation: OwnerCreation;
  countryCode: string | null;
  labelledBy: string;
  isAdmin: boolean;
  submittedName: string | null;
  tone: FieldLook;
  isInvalid: boolean;
  describedBy?: string;
  isDisabled: boolean;
};

type OwnerRow =
  | { kind: "unknown"; key: string; label: string }
  | { kind: "listed"; key: string; label: string; owner: StructureOwner }
  | { kind: "proposed"; key: string; label: string }
  | { kind: "create"; key: string; label: string };

type OwnerMarkProps = {
  brand: Brand | null;
};

type OwnerOptionProps = {
  row: OwnerRow;
  brand: Brand | null;
};

const UNKNOWN_KEY = "unknown";
const CREATE_KEY = "create";
const OWNER_KEY_PREFIX = "owner:";
const PROPOSED_KEY_PREFIX = "proposed:";
const TRIGGER_CLASS = "w-full cursor-pointer justify-between gap-2 px-2.5 font-normal text-foreground";
const LIST_CLASS = "flex flex-col overflow-hidden p-0";
const ROWS_CLASS = "no-scrollbar min-h-0 flex-1 scroll-py-1 overflow-y-auto overscroll-contain p-1";
const NEW_TAG_CLASS = "inline-flex h-4.5 shrink-0 items-center rounded-md bg-primary/12 px-1.5 text-[11px] leading-none font-semibold text-primary";

function getRowKey(row: OwnerRow): string {
  return row.key;
}

function getRowLabel(row: OwnerRow): string {
  return row.label;
}

function isSameRow(left: OwnerRow, right: OwnerRow): boolean {
  return left.key === right.key;
}

function toChoiceKey(choice: OwnerChoice): string {
  if (choice.kind === "listed") return `${OWNER_KEY_PREFIX}${choice.ownerId}`;
  if (choice.kind === "proposed") return `${PROPOSED_KEY_PREFIX}${choice.name.trim()}`;
  return UNKNOWN_KEY;
}

function listProposedNames(value: OwnerChoice, submittedName: string | null): string[] {
  const names = new Set<string>();
  if (value.kind === "proposed") names.add(value.name.trim());
  if (submittedName !== null) names.add(submittedName.trim());
  names.delete("");
  return [...names];
}

function toProposedRow(name: string): OwnerRow {
  return { kind: "proposed", key: `${PROPOSED_KEY_PREFIX}${name}`, label: name };
}

function toOwnerRow(owner: StructureOwner): OwnerRow {
  return { kind: "listed", key: `${OWNER_KEY_PREFIX}${owner.id}`, label: owner.name, owner };
}

function matchesQuery(row: OwnerRow, foldedQuery: string): boolean {
  return foldText(row.label).includes(foldedQuery);
}

function appendOwner(known: StructureOwner[] | undefined, owner: StructureOwner): StructureOwner[] | undefined {
  if (known === undefined || known.some((entry) => entry.id === owner.id)) return known;
  return [...known, owner];
}

function findOwnerByName(owners: readonly StructureOwner[], name: string): StructureOwner | null {
  const foldedName = foldText(name.trim());
  return owners.find((owner) => foldText(owner.name) === foldedName) ?? null;
}

function OwnerMark({ brand }: OwnerMarkProps) {
  if (brand === null) return <HugeiconsIcon icon={Building03Icon} aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />;

  return (
    <span className="flex min-w-4 shrink-0 items-center justify-center">
      <BrandMark brand={brand} size={16} />
    </span>
  );
}

function NewOwnerTag() {
  const { t } = useTranslation();

  return <span className={NEW_TAG_CLASS}>{t("stations:edit.owner.newTag")}</span>;
}

function OwnerOption({ row, brand }: OwnerOptionProps) {
  return (
    <ComboboxItem value={row} className="cursor-pointer">
      <OwnerMark brand={brand} />
      <span className={cn("min-w-0 truncate", row.kind === "unknown" && "text-muted-foreground")}>{row.label}</span>
      {row.kind === "proposed" ? <NewOwnerTag /> : null}
    </ComboboxItem>
  );
}

export function OwnerPicker({
  value,
  onChange,
  owners,
  selectedOwner,
  brands,
  operators,
  creation,
  countryCode,
  labelledBy,
  isAdmin,
  submittedName,
  tone,
  isInvalid,
  describedBy,
  isDisabled,
}: OwnerPickerProps) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const valueId = useId();
  const [query, setQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogName, setDialogName] = useState("");

  const typedName = query.trim();
  const foldedQuery = foldText(typedName);
  const unknownLabel = t("common:labels.unknown");
  const fieldLabel = t("common:structure.owner");
  const unknownRow: OwnerRow = { kind: "unknown", key: UNKNOWN_KEY, label: unknownLabel };
  const proposedRows = listProposedNames(value, submittedName).map(toProposedRow);
  const ownerRows = [...owners].sort((left, right) => left.name.localeCompare(right.name, i18n.language)).map(toOwnerRow);
  const namedRows = [...proposedRows, ...ownerRows];
  const shownProposedRows = proposedRows.filter((row) => matchesQuery(row, foldedQuery));
  const shownChoiceRows = [unknownRow, ...ownerRows].filter((row) => matchesQuery(row, foldedQuery));
  const hasShownRows = shownProposedRows.length > 0 || shownChoiceRows.length > 0;
  const hasExactMatch = foldedQuery !== "" && namedRows.some((row) => foldText(row.label) === foldedQuery);
  const isNamedCreation = typedName !== "" && !hasShownRows;
  const selectedKey = toChoiceKey(value);
  const selectedRow = [unknownRow, ...namedRows].find((row) => row.key === selectedKey) ?? null;

  let createLabel: string;
  if (creation === "propose") {
    createLabel = isNamedCreation ? t("stations:edit.owner.proposeNamed", { name: typedName }) : t("stations:edit.owner.propose");
  } else {
    createLabel = isNamedCreation ? t("stations:edit.owner.addNamed", { name: typedName }) : t("admin:reference.owners.add");
  }
  const createRow: OwnerRow | null = creation === "none" || hasExactMatch ? null : { kind: "create", key: CREATE_KEY, label: createLabel };
  const shownRows = createRow === null ? [...shownProposedRows, ...shownChoiceRows] : [...shownProposedRows, ...shownChoiceRows, createRow];

  function getRowBrand(row: OwnerRow): Brand | null {
    return row.kind === "listed" ? getStructureOwnerBrand(row.owner, brands, operators) : null;
  }

  function chooseRow(row: OwnerRow | null) {
    if (row === null) return;
    if (row.kind === "create") {
      setDialogName(typedName);
      setIsDialogOpen(true);
      return;
    }

    if (row.kind === "listed") onChange({ kind: "listed", ownerId: row.owner.id });
    else if (row.kind === "proposed") onChange({ kind: "proposed", name: row.label });
    else onChange({ kind: "unknown" });
  }

  function chooseCreatedOwner(owner: StructureOwner) {
    queryClient.setQueryData(structureOwnersQueryOptions().queryKey, (known) => appendOwner(known, owner));
    onChange({ kind: "listed", ownerId: owner.id });
  }

  function chooseProposedName(name: string) {
    const existingOwner = findOwnerByName(owners, name);
    onChange(existingOwner === null ? { kind: "proposed", name } : { kind: "listed", ownerId: existingOwner.id });
  }

  let triggerName = unknownLabel;
  if (value.kind === "listed") triggerName = selectedOwner?.name ?? `#${value.ownerId}`;
  if (value.kind === "proposed") triggerName = value.name;
  const proposedOptions = shownProposedRows.map((row) => <OwnerOption key={row.key} row={row} brand={null} />);

  return (
    <>
      <Combobox<OwnerRow>
        items={shownRows}
        filter={null}
        value={selectedRow}
        onValueChange={chooseRow}
        inputValue={query}
        onInputValueChange={(nextQuery) => setQuery(nextQuery)}
        onOpenChange={(isOpen) => {
          if (isOpen) setQuery("");
        }}
        itemToStringLabel={getRowLabel}
        itemToStringValue={getRowKey}
        isItemEqualToValue={isSameRow}
        disabled={isDisabled}
        autoHighlight
      >
        <ComboboxTrigger
          render={<Button type="button" variant="outline" className={cn(TRIGGER_CLASS, getFieldClass(tone, isInvalid))} />}
          aria-labelledby={`${labelledBy} ${valueId}`}
          aria-invalid={isInvalid || undefined}
          aria-describedby={describedBy}
        >
          <span id={valueId} className="flex min-w-0 items-center gap-2">
            <OwnerMark brand={value.kind === "listed" ? getStructureOwnerBrand(selectedOwner, brands, operators) : null} />
            <span className={cn("truncate", value.kind === "unknown" && "text-muted-foreground")}>{triggerName}</span>
            {value.kind === "proposed" ? <NewOwnerTag /> : null}
          </span>
        </ComboboxTrigger>
        <ComboboxContent aria-label={fieldLabel}>
          <ComboboxInput
            showTrigger={false}
            placeholder={t("common:placeholder.search")}
            aria-label={t("stations:edit.owner.search")}
            maxLength={EDIT_LIMITS.ownerName}
          >
            <InputGroupAddon align="inline-start">
              <HugeiconsIcon icon={Search01Icon} aria-hidden="true" />
            </InputGroupAddon>
          </ComboboxInput>
          {hasShownRows ? null : (
            <p role="status" className="py-2 text-center text-sm text-muted-foreground">
              {t("admin:reference.owners.list.noMatches")}
            </p>
          )}
          <ComboboxList aria-label={fieldLabel} className={LIST_CLASS}>
            {hasShownRows ? (
              <div role="presentation" className={ROWS_CLASS}>
                {submittedName === null || shownProposedRows.length === 0 ? (
                  proposedOptions
                ) : (
                  <ComboboxGroup>
                    <ComboboxLabel>{t("stations:edit.marks.submitted")}</ComboboxLabel>
                    {proposedOptions}
                  </ComboboxGroup>
                )}
                {shownProposedRows.length > 0 && shownChoiceRows.length > 0 ? <ComboboxSeparator /> : null}
                {shownChoiceRows.map((row) => (
                  <OwnerOption key={row.key} row={row} brand={getRowBrand(row)} />
                ))}
              </div>
            ) : null}
            {createRow === null ? null : (
              <div role="presentation" className="shrink-0 border-t p-1">
                <ComboboxItem value={createRow} className="cursor-pointer pr-1.5 text-muted-foreground">
                  <HugeiconsIcon icon={Add01Icon} aria-hidden="true" />
                  <span className="min-w-0 truncate">{createRow.label}</span>
                </ComboboxItem>
              </div>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {creation === "create" ? (
        <StructureOwnerDialog
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          initialName={dialogName}
          defaultCountryCode={countryCode ?? undefined}
          lockedCountryCode={isAdmin || countryCode === null ? undefined : countryCode}
          onCreated={chooseCreatedOwner}
        />
      ) : null}
      {creation === "propose" ? (
        <OwnerNameDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} initialName={dialogName} onSubmit={chooseProposedName} />
      ) : null}
    </>
  );
}
