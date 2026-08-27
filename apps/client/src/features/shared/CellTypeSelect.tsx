import { useTranslation } from "react-i18next";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CellType } from "@/types/station";

import { CELL_TYPES, CELL_TYPE_I18N_KEY, CELL_TYPE_LABELS } from "./cellTypes";

type CellTypeSelectProps = {
  value: CellType | null;
  onChange: (value: CellType | null) => void;
  disabled?: boolean;
  className?: string;
  onKeyDown?: React.KeyboardEventHandler;
};

export function CellTypeSelect({ value, onChange, disabled, className, onKeyDown }: CellTypeSelectProps) {
  const { t } = useTranslation();

  return (
    <Select value={value ?? "_none"} onValueChange={(v) => onChange(v === "_none" ? null : (v as CellType))} disabled={disabled}>
      <SelectTrigger
        className={className ?? "h-7 w-20 text-sm focus:border-ring focus:ring-[3px] focus:ring-ring/50"}
        onKeyDown={onKeyDown}
        data-nav-cell
      >
        <SelectValue>{value ? CELL_TYPE_LABELS[value] : "-"}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="_none">-</SelectItem>
        {CELL_TYPES.map((ct) => (
          <SelectItem key={ct} value={ct}>
            {t(`stations:cells.${CELL_TYPE_I18N_KEY[ct]}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
