import { Add01Icon, InformationCircleIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";

import { type ChangeField, type ChangeRow, type RatTable, getEditKey } from "../model/cellChanges";
import { findBand, formatDegrees, getRatGeneration, getRatName } from "../model/format";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useMapLookups } from "@/features/map/data/mapLookups";
import { getBandCode, getBandLabel } from "@/features/station-details/station/utils/bands";
import { getFieldClass } from "@/features/station-editing/components/frame/fieldLook";
import { FieldMarks } from "@/features/station-editing/components/frame/wasLine";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";
import { cn } from "@/lib/utils";

export type ChangeNote = { tone: "added" | "muted"; text: string };

type CellChangeTableProps = {
  table: RatTable;
  stationLabel: string;
  showsNetworks: boolean;
  isReadOnly: boolean;
  notes: readonly ChangeNote[];
  onEdit: (key: string, value: string) => void;
};

type NumberCellProps = {
  field: ChangeField;
  rowIndex: number;
  rowNumber: number;
  isNew: boolean;
  isReadOnly: boolean;
  onEdit: (key: string, value: string) => void;
};

type ChangeRowProps = {
  row: ChangeRow;
  rowNumber: number;
  columns: string;
  showsNetworks: boolean;
  isReadOnly: boolean;
  onEdit: (key: string, value: string) => void;
};

const BOX_CLASS = "flex h-7 items-center overflow-hidden rounded-md border border-input px-1.5 text-xs whitespace-nowrap";
const NOTE_ICONS: Record<ChangeNote["tone"], IconSvgElement> = { added: Add01Icon, muted: InformationCircleIcon };
const NOTE_CLASSES: Record<ChangeNote["tone"], string> = {
  added: "text-emerald-700 dark:text-emerald-400",
  muted: "text-muted-foreground",
};

function getColumns(fieldCount: number, showsNetworks: boolean): string {
  return ["92px", "66px", `repeat(${fieldCount}, minmax(52px, 1fr))`, showsNetworks ? "96px" : null, "104px", "26px"]
    .filter((part) => part !== null)
    .join(" ");
}

function NumberCell({ field, rowIndex, rowNumber, isNew, isReadOnly, onEdit }: NumberCellProps) {
  const { t } = useTranslation("admin");
  let look: "plain" | "changed" | "added" = "plain";
  if (field.was !== null) look = "changed";
  else if (isNew) look = "added";
  const fieldClass = getFieldClass(look, field.isInvalid, true);
  const label = t("observationFlags.table.fieldLabel", { field: field.label, row: rowNumber });

  return (
    <span className="min-w-0">
      {field.isEditable && !isReadOnly ? (
        <Input
          {...NO_AUTOFILL_PROPS}
          inputMode="numeric"
          aria-label={label}
          aria-invalid={field.isInvalid || undefined}
          value={field.value}
          onChange={(event) => onEdit(getEditKey(rowIndex, field.field), event.currentTarget.value)}
          className={cn("h-7 px-1.5 font-mono text-xs tabular-nums md:text-xs", fieldClass)}
        />
      ) : (
        <span aria-label={label} className={cn(BOX_CLASS, "font-mono tabular-nums", fieldClass)}>
          {field.value === "" ? "-" : field.value}
        </span>
      )}
      {field.was === null ? null : <FieldMarks variant="struck" marks={[{ tone: "database", value: { text: String(field.was) } }]} />}
    </span>
  );
}

function ChangeTableRow({ row, rowNumber, columns, showsNetworks, isReadOnly, onEdit }: ChangeRowProps) {
  const { t, i18n } = useTranslation(["admin", "stations"]);
  const { lookups } = useMapLookups();
  const band = findBand(row.bandId, lookups);
  const bandLabel = getBandLabel(band, i18n.language);
  const bandCode = getBandCode(band);
  const style: CSSProperties = { gridTemplateColumns: columns };
  const networks = row.plmns.join(", ");

  return (
    <div
      role="group"
      aria-label={t("observationFlags.table.rowLabel", { row: rowNumber, rat: getRatName(row.rat) })}
      style={style}
      className={cn("relative grid items-start gap-x-1.5 border-b py-1 pr-2 pl-3 last:border-b-0", row.isNew ? "bg-emerald-500/6" : null)}
    >
      <span aria-hidden="true" className={cn("absolute inset-y-0 left-0 w-[3px]", row.isNew ? "bg-emerald-500" : "bg-amber-500")} />
      <span className={cn(BOX_CLASS, "justify-between gap-1", row.isNew ? "border-emerald-500/60 bg-emerald-500/6" : null)}>
        <span className="truncate">
          <span className="font-semibold">{bandLabel ?? "-"}</span>{" "}
          {bandCode === null ? null : <span className="text-muted-foreground">{bandCode}</span>}
        </span>
      </span>
      <span className={cn(BOX_CLASS, "tabular-nums", row.sectorAzimuth === null ? "text-muted-foreground" : null)}>
        {row.sectorAzimuth === null ? "-" : formatDegrees(row.sectorAzimuth)}
      </span>
      {row.fields.map((field) => (
        <NumberCell
          key={field.field}
          field={field}
          rowIndex={row.index}
          rowNumber={rowNumber}
          isNew={row.isNew}
          isReadOnly={isReadOnly}
          onEdit={onEdit}
        />
      ))}
      {showsNetworks ? (
        <span className="min-w-0">
          <span className={cn(BOX_CLASS, "font-mono tabular-nums", getFieldClass(row.wasPlmns === null ? "plain" : "changed", false, true))}>
            {networks === "" ? "-" : networks}
          </span>
          {row.wasPlmns === null ? null : (
            <FieldMarks variant="struck" marks={[{ tone: "database", value: { text: row.wasPlmns.length === 0 ? "-" : row.wasPlmns.join(", ") } }]} />
          )}
        </span>
      ) : null}
      <span className={cn(BOX_CLASS, "text-muted-foreground")}>
        {row.cellType === null ? "-" : t(`stations:cells.cellTypes.${row.cellType}cell`)}
      </span>
      <Tooltip>
        <TooltipTrigger render={<span className="flex h-7 items-center justify-center" />}>
          <span className="flex size-4 items-center justify-center rounded-sm border border-primary bg-primary text-primary-foreground">
            <HugeiconsIcon icon={Tick02Icon} aria-hidden="true" className="size-3" />
          </span>
          <span className="sr-only">{t("observationFlags.table.confirmed")}</span>
        </TooltipTrigger>
        <TooltipContent>{t("observationFlags.table.confirmed")}</TooltipContent>
      </Tooltip>
    </div>
  );
}

export function CellChangeTable({ table, stationLabel, showsNetworks, isReadOnly, notes, onEdit }: CellChangeTableProps) {
  const { t } = useTranslation(["admin", "common"]);
  const [firstRow] = table.rows;
  const fieldLabels = firstRow?.fields.map((field) => field.label) ?? [];
  const columns = getColumns(fieldLabels.length, showsNetworks);
  const newCount = table.rows.filter((row) => row.isNew).length;
  const changedCount = table.rows.length - newCount;

  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="flex h-11 items-center gap-2 border-b bg-muted/50 px-4">
        <span className="rounded-sm bg-foreground/10 px-1 font-mono text-[11px] font-semibold">{getRatGeneration(table.rat)}</span>
        <span className="text-sm font-semibold">{getRatName(table.rat)}</span>
        <span className="truncate text-xs text-muted-foreground">{t("observationFlags.table.station", { station: stationLabel })}</span>
        {newCount > 0 ? (
          <span className="ml-1 text-xs whitespace-nowrap text-emerald-700 dark:text-emerald-400">
            {t("observationFlags.table.newCells", { count: newCount })}
          </span>
        ) : null}
        {changedCount > 0 ? (
          <span className="ml-1 text-xs whitespace-nowrap text-amber-700 dark:text-amber-400">
            {t("observationFlags.table.changedCells", { count: changedCount })}
          </span>
        ) : null}
      </div>
      <div className="custom-scrollbar overflow-x-auto">
        <div className="min-w-[680px]">
          <div
            style={{ gridTemplateColumns: columns }}
            className="grid h-8 items-center gap-x-1.5 border-b pr-2 pl-3 text-[11px] font-medium text-muted-foreground"
          >
            <span>{t("observationFlags.table.band")}</span>
            <span>{t("observationFlags.table.azimuth")}</span>
            {fieldLabels.map((label) => (
              <span key={label}>{label}</span>
            ))}
            {showsNetworks ? <span>{t("observationFlags.table.networks")}</span> : null}
            <span>{t("observationFlags.table.cellType")}</span>
            <span className="flex justify-center">
              <HugeiconsIcon icon={Tick02Icon} aria-hidden="true" className="size-3.5" />
              <span className="sr-only">{t("observationFlags.table.confirmedShort")}</span>
            </span>
          </div>
          {table.rows.map((row, position) => (
            <ChangeTableRow
              key={row.index}
              row={row}
              rowNumber={position + 1}
              columns={columns}
              showsNetworks={showsNetworks}
              isReadOnly={isReadOnly}
              onEdit={onEdit}
            />
          ))}
        </div>
      </div>
      {notes.length === 0 ? null : (
        <ul className="flex flex-col gap-1 border-t px-3 py-2">
          {notes.map((note) => (
            <li key={note.text} className={cn("flex items-start gap-1.5 text-xs", NOTE_CLASSES[note.tone])}>
              <HugeiconsIcon icon={NOTE_ICONS[note.tone]} aria-hidden="true" className="mt-px size-3.5 shrink-0" />
              <span className="min-w-0">{note.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
