import { Copy01Icon, Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CellTypeSelect } from "@/features/shared/CellTypeSelect";
import { getBandName } from "@/features/station-details/frequencyCalc";
import { cn } from "@/lib/utils";
import type { Band, CellType, SectorDraft } from "@/types/station";

import { CellDetailsFields } from "./cellDetailsFields";
import { useBandSelection } from "./hooks/useBandSelection";
import { type RAT_ORDER, getRatShowsBandDuplex } from "./rat";
import { navigateRowHorizontal } from "./rowNav";

export type CellDraftBase = {
  _localId: string;
  _sectorLocalId?: string | null;
  rat: (typeof RAT_ORDER)[number];
  band_id: number;
  type: CellType | null;
  is_confirmed: boolean;
  notes: string;
  details: Record<string, unknown>;
};

type CellEditRowProps = {
  localCell: CellDraftBase;
  bands: Band[];
  disabled?: boolean;
  leftBorderClass?: string;
  showDelete?: boolean;
  rowClassName?: string;
  sectors?: SectorDraft[];
  onChange: (localId: string, patch: Partial<CellDraftBase>) => void;
  onDelete: (localId: string) => void;
  onClone?: (localId: string) => void;
};

export const CellEditRow = memo(function CellEditRow({
  localCell,
  bands,
  disabled,
  leftBorderClass,
  showDelete = true,
  rowClassName,
  sectors,
  onChange,
  onDelete,
  onClone,
}: CellEditRowProps) {
  const { t } = useTranslation();
  const { uniqueBandValues, bandValue, duplex, duplexOptions, hasDuplexChoice, findBandId, findPreferredBandId } = useBandSelection(
    bands,
    localCell.rat,
    localCell.band_id,
  );
  const selectedSectorIndex = sectors?.findIndex((sector) => sector._localId === localCell._sectorLocalId) ?? -1;
  const selectedSector = selectedSectorIndex >= 0 ? sectors?.[selectedSectorIndex] : undefined;
  const selectedSectorLabel = selectedSector ? `A${selectedSectorIndex + 1}` : "-";

  const handleBandValueChange = (value: number | null) => {
    const newBandId = findPreferredBandId(value, undefined, duplex);
    if (newBandId) {
      const patch: Partial<CellDraftBase> = { band_id: newBandId };
      if (localCell.rat === "GSM" && value === 1800) patch.details = { ...localCell.details, e_gsm: false };
      onChange(localCell._localId, patch);
    }
  };

  const handleDuplexChange = (dup: string | null) => {
    const newBandId = findBandId(bandValue, dup);
    if (newBandId) onChange(localCell._localId, { band_id: newBandId });
  };

  const handleDetailChange = (field: string, value: number | boolean | string | undefined) => {
    const next = { ...localCell.details };
    if (value === undefined) delete next[field];
    else next[field] = value;
    onChange(localCell._localId, { details: next });
  };

  const handleDetailsBulkChange = (changes: Record<string, number | boolean | string | undefined>) => {
    const next = { ...localCell.details };
    for (const [field, value] of Object.entries(changes)) {
      if (value === undefined) delete next[field];
      else next[field] = value;
    }
    onChange(localCell._localId, { details: next });
  };

  return (
    <tr className={cn("border-b last:border-0 transition-colors hover:bg-muted/50", rowClassName)}>
      <td className={cn("px-3 py-1", leftBorderClass)}>
        <Select
          value={bandValue?.toString() ?? ""}
          onValueChange={(v) => handleBandValueChange(v ? Number.parseInt(v, 10) : null)}
          disabled={disabled}
        >
          <SelectTrigger
            className="h-7 w-20 text-sm focus:border-ring focus:ring-[3px] focus:ring-ring/50"
            onKeyDown={navigateRowHorizontal}
            data-nav-cell
          >
            <SelectValue>{bandValue === null ? "-" : bandValue === 0 ? t("stations:cells.unknownBand") : bandValue}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {uniqueBandValues.map((v) => {
              const name = v !== 0 ? getBandName(localCell.rat, v, duplex) : null;
              return (
                <SelectItem key={v} value={v.toString()}>
                  {v === 0 ? t("stations:cells.unknownBand") : v}
                  {name ? <span className="opacity-75">({name})</span> : null}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </td>
      {getRatShowsBandDuplex(localCell.rat) && (
        <td className="px-3 py-1">
          {hasDuplexChoice ? (
            <Select value={duplex ?? "_none"} onValueChange={(v) => handleDuplexChange(v === "_none" ? null : v)} disabled={disabled}>
              <SelectTrigger
                className="h-7 w-20 text-sm focus:border-ring focus:ring-[3px] focus:ring-ring/50"
                onKeyDown={navigateRowHorizontal}
                data-nav-cell
              >
                <SelectValue>{duplex ?? "-"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {duplexOptions.includes(null) && <SelectItem value="_none">-</SelectItem>}
                {duplexOptions
                  .filter((d) => d !== null)
                  .map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-muted-foreground text-xs">-</span>
          )}
        </td>
      )}
      {sectors && sectors.length > 0 ? (
        <td className="px-1 py-1">
          <Select
            value={localCell._sectorLocalId ?? "_none"}
            onValueChange={(value) => onChange(localCell._localId, { _sectorLocalId: value === "_none" ? null : value })}
            disabled={disabled}
          >
            <SelectTrigger
              className="h-7 w-17 text-sm focus:border-ring focus:ring-[3px] focus:ring-ring/50"
              onKeyDown={navigateRowHorizontal}
              data-nav-cell
            >
              <SelectValue>{selectedSectorLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">-</SelectItem>
              {sectors.map((sector, index) => (
                <SelectItem key={sector._localId} value={sector._localId}>
                  A{index + 1}
                  {typeof sector.azimuth === "number" ? ` (${sector.azimuth}°)` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </td>
      ) : null}
      <CellDetailsFields
        rat={localCell.rat}
        bandValue={bandValue}
        details={localCell.details}
        disabled={disabled}
        onDetailChange={handleDetailChange}
        onDetailsBulkChange={handleDetailsBulkChange}
      />
      <td className="px-3 py-1">
        <CellTypeSelect
          value={localCell.type}
          onChange={(v) => onChange(localCell._localId, { type: v })}
          disabled={disabled}
          onKeyDown={navigateRowHorizontal}
        />
      </td>
      <td className="px-3 py-1">
        <Input
          type="text"
          placeholder={t("stations:cells.notesPlaceholder")}
          value={localCell.notes}
          onChange={(e) => onChange(localCell._localId, { notes: e.target.value })}
          onKeyDown={navigateRowHorizontal}
          data-nav-cell
          className="h-7 w-28 text-sm"
          disabled={disabled}
        />
      </td>
      <td className="px-3 py-1">
        <Checkbox
          checked={localCell.is_confirmed}
          onCheckedChange={(checked) => onChange(localCell._localId, { is_confirmed: checked === true })}
          onKeyDown={navigateRowHorizontal}
          data-nav-cell
          disabled={disabled}
        />
      </td>
      <td className="px-3 py-1">
        <div className="flex items-center gap-0.5">
          {onClone && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onClone(localCell._localId)}
              onKeyDown={navigateRowHorizontal}
              data-nav-cell
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
              disabled={disabled}
            >
              <HugeiconsIcon icon={Copy01Icon} className="size-3.5" />
            </Button>
          )}
          {showDelete && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(localCell._localId)}
              onKeyDown={navigateRowHorizontal}
              data-nav-cell
              className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
            >
              <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
});
