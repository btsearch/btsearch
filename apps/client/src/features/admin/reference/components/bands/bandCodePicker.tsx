import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import { type CatalogBand, formatCatalogRanges, getCatalogBandLabel, isUplinkOnly, matchesCatalogQuery } from "./bandCatalog";
import { Button } from "@/components/ui/button";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxTrigger } from "@/components/ui/combobox";
import { InputGroupAddon } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

type BandCodePickerProps = {
  entries: readonly CatalogBand[];
  selectedCode: string | null;
  takenNames: ReadonlyMap<string, string>;
  placeholder: string;
  labelledBy: string;
  isDisabled: boolean;
  onSelect: (entry: CatalogBand) => void;
};

type CatalogOptionProps = {
  entry: CatalogBand;
  takenName?: string;
};

const CODE_CLASS = "font-mono text-[0.8125rem]";
const TRIGGER_CLASS = "w-full cursor-pointer justify-between gap-2 px-2.5 font-normal text-foreground";
const LIST_CLASS = "max-h-[min(--spacing(60),calc(var(--available-height)---spacing(20)))]";
const OPTION_CLASS = "min-h-11 cursor-pointer gap-2.5 py-1.5 pl-2 data-[disabled]:opacity-100";
const OPTION_DETAIL_CLASS = "block truncate font-mono text-[0.6875rem] leading-4 text-muted-foreground";

function getEntryCode(entry: CatalogBand): string {
  return entry.code;
}

function CatalogOption({ entry, takenName }: CatalogOptionProps) {
  const { t } = useTranslation("admin");

  let unavailableReason: string | null = null;
  if (isUplinkOnly(entry)) unavailableReason = t("admin:reference.bands.picker.cannotHoldCells");
  else if (takenName !== undefined) unavailableReason = t("admin:reference.bands.picker.exists", { name: takenName });
  const isUnavailable = unavailableReason !== null;

  return (
    <ComboboxItem value={entry} disabled={isUnavailable} className={OPTION_CLASS}>
      <span className={cn("w-20 shrink-0 font-semibold", CODE_CLASS, isUnavailable && "text-muted-foreground")}>{entry.code}</span>
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate leading-5", isUnavailable && "text-muted-foreground")}>{getCatalogBandLabel(t, entry)}</span>
        <span className={OPTION_DETAIL_CLASS}>{unavailableReason ?? formatCatalogRanges(entry)}</span>
      </span>
    </ComboboxItem>
  );
}

export function BandCodePicker({ entries, selectedCode, takenNames, placeholder, labelledBy, isDisabled, onSelect }: BandCodePickerProps) {
  const { t } = useTranslation("admin");
  const valueId = useId();
  const selectedEntry = selectedCode === null ? null : (entries.find((entry) => entry.code === selectedCode) ?? null);
  const catalogLabel = t("admin:reference.bands.picker.catalog");

  function chooseEntry(entry: CatalogBand | null) {
    if (entry === null || entry.code === selectedCode || isUplinkOnly(entry) || takenNames.has(entry.code)) return;
    onSelect(entry);
  }

  return (
    <Combobox<CatalogBand>
      items={entries}
      value={selectedEntry}
      onValueChange={chooseEntry}
      itemToStringLabel={getEntryCode}
      filter={matchesCatalogQuery}
      disabled={isDisabled}
      autoHighlight
    >
      <ComboboxTrigger render={<Button type="button" variant="outline" className={TRIGGER_CLASS} />} aria-labelledby={`${labelledBy} ${valueId}`}>
        <span id={valueId} className="flex min-w-0 items-center gap-2">
          {selectedCode === null ? (
            <span className="truncate text-muted-foreground">{placeholder}</span>
          ) : (
            <span className={CODE_CLASS}>{selectedCode}</span>
          )}
          {selectedEntry === null ? null : <span className="truncate text-muted-foreground">{getCatalogBandLabel(t, selectedEntry)}</span>}
        </span>
      </ComboboxTrigger>
      <ComboboxContent aria-label={catalogLabel}>
        <ComboboxInput
          showTrigger={false}
          placeholder={t("admin:reference.bands.picker.searchPlaceholder")}
          aria-label={t("admin:reference.bands.picker.search")}
        >
          <InputGroupAddon align="inline-start">
            <HugeiconsIcon icon={Search01Icon} aria-hidden="true" />
          </InputGroupAddon>
        </ComboboxInput>
        <ComboboxEmpty>{t("admin:reference.bands.picker.noMatches")}</ComboboxEmpty>
        <ComboboxList aria-label={catalogLabel} className={LIST_CLASS}>
          {(entry: CatalogBand) => <CatalogOption key={entry.code} entry={entry} takenName={takenNames.get(entry.code)} />}
        </ComboboxList>
        <p className="border-t px-2.5 py-2 text-xs leading-4 text-muted-foreground">{t("admin:reference.bands.picker.uplinkNote")}</p>
      </ComboboxContent>
    </Combobox>
  );
}
