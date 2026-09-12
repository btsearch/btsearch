import { navigateRowHorizontal } from "./rowNav";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DetailComputedCell, DetailInputCell } from "@/features/admin/cells/components/detailFieldCells";
import { type RatDetailField, getRatDetailFields } from "@/features/shared/ratCellFields";
import { calculateComputedValues } from "@/features/shared/ratComputedValues";
import { cn } from "@/lib/utils";

const NR_TYPE_OPTIONS = [
  { value: "nsa", label: "NSA (Non-Standalone)" },
  { value: "sa", label: "SA (Standalone)" },
] as const;

type CellDetailsFieldsProps = {
  rat: string;
  bandValue?: number | null;
  details: Record<string, unknown>;
  detailErrors?: Record<string, string>;
  disabled?: boolean;
  onDetailChange: (field: string, value: number | boolean | string | undefined) => void;
  onDetailsBulkChange?: (changes: Record<string, number | boolean | string | undefined>) => void;
};

export function CellDetailsFields({ rat, bandValue, details, detailErrors, disabled, onDetailChange, onDetailsBulkChange }: CellDetailsFieldsProps) {
  const fields = getRatDetailFields(rat);
  if (fields.length === 0) return null;

  const nrType = (details.type as "nsa" | "sa") ?? "nsa";
  return (
    <>
      {fields.map((field) => (
        <EditorDetailField
          key={field.key}
          field={field}
          rat={rat}
          bandValue={bandValue}
          details={details}
          detailErrors={detailErrors}
          disabled={disabled}
          nrType={nrType}
          onDetailChange={onDetailChange}
          onDetailsBulkChange={onDetailsBulkChange}
        />
      ))}
    </>
  );
}

function EditorDetailField({
  field,
  rat,
  bandValue,
  details,
  detailErrors,
  disabled,
  nrType,
  onDetailChange,
  onDetailsBulkChange,
}: CellDetailsFieldsProps & { field: RatDetailField; nrType: "nsa" | "sa" }) {
  if (field.kind === "computed") return <DetailComputedCell value={field.computed ? calculateComputedValues(field.computed, details) : null} />;
  if (field.kind === "select")
    return (
      <NrTypeCell
        value={nrType}
        error={!!detailErrors?.type}
        disabled={disabled}
        onDetailChange={onDetailChange}
        onDetailsBulkChange={onDetailsBulkChange}
      />
    );
  if (field.kind === "boolean")
    return (
      <BooleanDetailCell
        field={field.key}
        rat={rat}
        bandValue={bandValue}
        details={details}
        disabled={disabled}
        nrType={nrType}
        onDetailChange={onDetailChange}
      />
    );

  return (
    <DetailInputCell
      field={field.key}
      placeholder={field.placeholder ?? field.label}
      value={(details[field.key] as number) ?? ""}
      error={!!detailErrors?.[field.key]}
      disabled={getInputDisabled(field.key, rat, details[field.key], disabled, nrType)}
      max={field.max}
      onDetailChange={onDetailChange}
    />
  );
}

function NrTypeCell({
  value,
  error,
  disabled,
  onDetailChange,
  onDetailsBulkChange,
}: {
  value: "nsa" | "sa";
  error: boolean;
  disabled?: boolean;
  onDetailChange: CellDetailsFieldsProps["onDetailChange"];
  onDetailsBulkChange?: CellDetailsFieldsProps["onDetailsBulkChange"];
}) {
  const nrTypeLabel = NR_TYPE_OPTIONS.find((opt) => opt.value === value)?.label ?? "NSA";
  return (
    <td className="px-1.5 py-1">
      <Select
        value={value}
        onValueChange={(nextValue) => {
          if (nextValue === "nsa") {
            if (onDetailsBulkChange)
              onDetailsBulkChange({
                type: "nsa",
                nrtac: undefined,
                clid: undefined,
                gnbid: undefined,
                supports_nr_redcap: undefined,
              });
            else onDetailChange("type", "nsa");
          } else onDetailChange("type", nextValue as "nsa" | "sa");
        }}
        disabled={disabled}
      >
        <SelectTrigger className={cn("h-7 w-18 text-sm", error && "border-destructive")} onKeyDown={navigateRowHorizontal} data-nav-cell>
          <SelectValue>{nrTypeLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent className="min-w-48">
          {NR_TYPE_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </td>
  );
}

function BooleanDetailCell({
  field,
  rat,
  bandValue,
  details,
  disabled,
  nrType,
  onDetailChange,
}: {
  field: string;
  rat: string;
  bandValue?: number | null;
  details: Record<string, unknown>;
  disabled?: boolean;
  nrType: "nsa" | "sa";
  onDetailChange: CellDetailsFieldsProps["onDetailChange"];
}) {
  const checked = field === "e_gsm" && bandValue === 1800 ? false : ((details[field] as boolean) ?? false);
  return (
    <td className="px-1.5 py-1">
      <Checkbox
        checked={checked}
        onCheckedChange={(value) => onDetailChange(field, value === true)}
        onKeyDown={navigateRowHorizontal}
        data-nav-cell
        disabled={getBooleanDisabled(field, rat, bandValue, details, disabled, nrType)}
      />
    </td>
  );
}

function getInputDisabled(field: string, rat: string, value: unknown, disabled: boolean | undefined, nrType: "nsa" | "sa"): boolean | undefined {
  if (disabled) return true;
  if (rat !== "NR") return disabled;
  if (!["nrtac", "clid", "gnbid"].includes(field)) return disabled;
  return nrType !== "sa" && (value === null || value === undefined);
}

function getBooleanDisabled(
  field: string,
  rat: string,
  bandValue: number | null | undefined,
  details: Record<string, unknown>,
  disabled: boolean | undefined,
  nrType: "nsa" | "sa",
): boolean | undefined {
  if (disabled) return true;
  if (field === "e_gsm") return rat === "GSM" && bandValue === 1800;
  if (field === "supports_nr_redcap") return nrType !== "sa" && details.supports_nr_redcap !== true;
  return disabled;
}
