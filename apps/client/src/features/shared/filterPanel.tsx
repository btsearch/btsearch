import { ArrowDown01Icon, Cancel01Icon, FilterIcon, Location01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ComponentProps, type FocusEventHandler, type ReactNode, type Ref, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { MobileFilterChip, MobileFilterPanelTitle } from "@/components/ui/mobile-filter-chip";
import { Checkbox } from "@/features/map/components/search-overlay/checkbox";
import { DialogOperatorName } from "@/features/station-details/components/dialogOperatorName";
import { partitionOperators } from "@/lib/operatorUtils";
import { cn } from "@/lib/utils";
import type { Operator, Region } from "@/types/station";

export function FilterPanelShell({ search, children }: { search: ReactNode; children: ReactNode }) {
  const { t } = useTranslation("common");

  return (
    <aside aria-label={t("labels.filters")} className="flex h-full w-72 shrink-0 flex-col border-r bg-muted/20">
      <div className="relative z-20 shrink-0 px-3 pt-3">{search}</div>
      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="space-y-4 px-3 py-3">{children}</div>
      </div>
    </aside>
  );
}

export function FilterPanelHeader({ activeFilterCount, onClearAll }: { activeFilterCount: number; onClearAll: () => void }) {
  const { t } = useTranslation("common");

  return (
    <div className="flex items-center justify-between border-t pt-3">
      <h2 className="text-sm font-semibold">{t("labels.filters")}</h2>
      {activeFilterCount > 0 ? (
        <button type="button" onClick={onClearAll} className="text-xs text-muted-foreground transition-colors hover:text-foreground">
          {t("actions.clearAll")}
        </button>
      ) : null}
    </div>
  );
}

type FilterPanelSectionProps = {
  title: ReactNode;
  hint?: ReactNode;
  onClear?: () => void;
  children: ReactNode;
};

export function FilterPanelSection({ title, hint, onClear, children }: FilterPanelSectionProps) {
  const { t } = useTranslation("common");

  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</h3>
          {hint}
        </div>
        {onClear ? (
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            {t("actions.clear")}
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function FilterPanelFooter({ children }: { children: ReactNode }) {
  return (
    <p className="border-t pt-3 text-xs text-muted-foreground" role="status">
      {children}
    </p>
  );
}

const FACET_PILL_CLASS =
  "inline-flex h-7 items-center gap-1.5 rounded-full border border-transparent px-2.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring";
const FACET_PILL_ACTIVE_CLASS = "bg-primary text-primary-foreground";
const FACET_PILL_INACTIVE_CLASS = "bg-foreground/5 text-foreground/80 hover:bg-foreground/10 hover:text-foreground";

export function sortBandsUnknownLast(values: readonly number[]): number[] {
  const known = values.filter((value) => value !== 0).sort((left, right) => left - right);
  return values.includes(0) ? [...known, 0] : known;
}

export function FacetPill({
  active,
  onClick,
  className,
  children,
}: {
  active: boolean;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(FACET_PILL_CLASS, active ? FACET_PILL_ACTIVE_CLASS : FACET_PILL_INACTIVE_CLASS, className)}
    >
      {children}
    </button>
  );
}

export function KbdHint({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "hidden shrink-0 items-center rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px] leading-none text-foreground md:inline-flex",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

type FilterSearchShellProps = {
  hasValue: boolean;
  onClear: () => void;
  children: ReactNode;
  overlay?: ReactNode;
  containerRef?: Ref<HTMLElement>;
  onBlur?: FocusEventHandler<HTMLElement>;
  className?: string;
};

export function FilterSearchShell({ hasValue, onClear, children, overlay, containerRef, onBlur, className }: FilterSearchShellProps) {
  const { t } = useTranslation("common");

  return (
    <search ref={containerRef} onBlur={onBlur} className={cn("relative", className)}>
      <div className="flex h-9 w-full min-w-0 items-center gap-2 rounded-lg border border-input bg-transparent pl-3 pr-1.5 transition-colors focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30">
        <HugeiconsIcon icon={Search01Icon} className="size-4 shrink-0 text-muted-foreground" />
        <div className="scrollbar-hide flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">{children}</div>
        {hasValue ? (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={t("actions.clear")}
          >
            <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
          </button>
        ) : null}
      </div>
      {overlay}
    </search>
  );
}

export function FilterSearchInput({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      type="text"
      autoComplete="off"
      spellCheck={false}
      className={cn("h-full min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground", className)}
      {...props}
    />
  );
}

type OperatorCheckboxGridProps = {
  operators: Operator[];
  selectedMncs: number[];
  onToggle: (mnc: number) => void;
  keybinds?: Record<number, string>;
};

export function OperatorCheckboxGrid({ operators, selectedMncs, onToggle, keybinds }: OperatorCheckboxGridProps) {
  const { t } = useTranslation("common");
  const [showOtherOperators, setShowOtherOperators] = useState(false);
  const { top: topOperators, other: otherOperators } = useMemo(() => partitionOperators(operators), [operators]);
  const selectedOtherOperatorCount = useMemo(
    () => otherOperators.filter((operator) => selectedMncs.includes(operator.mnc)).length,
    [otherOperators, selectedMncs],
  );

  const renderOperator = (operator: Operator) => {
    const keybind = keybinds?.[operator.mnc];
    return (
      <Checkbox key={operator.mnc} checked={selectedMncs.includes(operator.mnc)} onChange={() => onToggle(operator.mnc)} className="min-w-0">
        <DialogOperatorName name={operator.name} mnc={operator.mnc} compact labelClassName="text-sm leading-5 font-normal" />
        {keybind ? <KbdHint className="ml-auto">{keybind}</KbdHint> : null}
      </Checkbox>
    );
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-1">{topOperators.map(renderOperator)}</div>
      {otherOperators.length > 0 ? (
        <div className="mt-1.5">
          <button
            type="button"
            aria-expanded={showOtherOperators}
            onClick={() => setShowOtherOperators((visible) => !visible)}
            className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              className={cn("size-3.5 transition-transform motion-reduce:transition-none", showOtherOperators ? "rotate-180" : null)}
            />
            <span>
              {t("labels.otherOperators", { count: otherOperators.length })}
              {selectedOtherOperatorCount > 0 ? ` (${t("labels.selected", { count: selectedOtherOperatorCount })})` : null}
            </span>
          </button>
          {showOtherOperators ? (
            <div className="mt-1.5 grid grid-cols-2 gap-1 border-t border-border/50 pt-1.5">{otherOperators.map(renderOperator)}</div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

type MobileOperatorFilterChipProps = {
  operators: Operator[];
  selectedMncs: number[];
  onToggle: (mnc: number) => void;
};

export function MobileOperatorFilterChip({ operators, selectedMncs, onToggle }: MobileOperatorFilterChipProps) {
  const { t } = useTranslation("common");
  const { top: topOperators, other: otherOperators } = useMemo(() => partitionOperators(operators), [operators]);

  return (
    <MobileFilterChip active={selectedMncs.length > 0} count={selectedMncs.length} icon={FilterIcon} label={t("labels.operator")}>
      <MobileFilterPanelTitle>{t("labels.operator")}</MobileFilterPanelTitle>
      <div className="grid gap-1">
        {[...topOperators, ...otherOperators].map((operator) => {
          const selected = selectedMncs.includes(operator.mnc);
          return (
            <button
              key={operator.mnc}
              type="button"
              aria-pressed={selected}
              onClick={() => onToggle(operator.mnc)}
              className={cn(
                "flex h-8 items-center gap-2 rounded-md px-2 text-left text-sm transition-colors",
                selected ? "bg-primary/10 text-primary" : "hover:bg-muted",
              )}
            >
              <DialogOperatorName
                name={operator.name}
                mnc={operator.mnc}
                compact
                labelClassName={cn("text-sm leading-5 font-normal", selected ? "text-primary" : null)}
              />
            </button>
          );
        })}
      </div>
    </MobileFilterChip>
  );
}

type MobileRegionFilterChipProps = {
  regions: Region[];
  selectedRegions: number[];
  onToggle: (regionId: number) => void;
};

export function MobileRegionFilterChip({ regions, selectedRegions, onToggle }: MobileRegionFilterChipProps) {
  const { t } = useTranslation("common");
  const regionById = useMemo(() => new Map(regions.map((region) => [region.id, region])), [regions]);
  const selectedRegionNames = useMemo(
    () => selectedRegions.map((id) => regionById.get(id)?.name).filter((name): name is string => Boolean(name)),
    [regionById, selectedRegions],
  );

  return (
    <MobileFilterChip active={selectedRegions.length > 0} count={selectedRegions.length} icon={Location01Icon} label={t("labels.region")}>
      <MobileFilterPanelTitle>{t("labels.region")}</MobileFilterPanelTitle>
      <div className="grid max-h-64 gap-1 overflow-y-auto">
        {regions.map((region) => {
          const selected = selectedRegions.includes(region.id);
          return (
            <button
              key={region.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onToggle(region.id)}
              className={cn(
                "flex h-8 items-center rounded-md px-2 text-left text-sm transition-colors",
                selected ? "bg-primary/10 text-primary" : "hover:bg-muted",
              )}
            >
              <span className="min-w-0 flex-1 truncate">{region.name}</span>
            </button>
          );
        })}
      </div>
      {selectedRegionNames.length > 0 ? <div className="px-1 text-xs text-muted-foreground">{selectedRegionNames.join(", ")}</div> : null}
    </MobileFilterChip>
  );
}

type RegionComboboxProps = {
  regions: Region[];
  selectedRegions: number[];
  onChange: (regionIds: number[]) => void;
};

export function RegionCombobox({ regions, selectedRegions, onChange }: RegionComboboxProps) {
  const { t } = useTranslation("common");
  const chipsRef = useRef<HTMLDivElement>(null);
  const regionById = useMemo(() => new Map(regions.map((region) => [region.id, region])), [regions]);
  const selectedRegionItems = useMemo(
    () => selectedRegions.map((id) => regionById.get(id)).filter((region): region is Region => region !== undefined),
    [regionById, selectedRegions],
  );
  const visibleSelectedRegions = selectedRegionItems.slice(0, 1);
  const hiddenSelectedRegionCount = selectedRegionItems.length - visibleSelectedRegions.length;

  return (
    <>
      <Combobox multiple value={selectedRegionItems} onValueChange={(values) => onChange(values.map((region) => region.id))} items={regions}>
        <ComboboxChips ref={chipsRef} className="h-8 min-h-8 max-h-8 flex-nowrap overflow-hidden text-sm has-data-[slot=combobox-chip]:px-2.5">
          <HugeiconsIcon icon={Location01Icon} className="pointer-events-none size-3.5 shrink-0 text-muted-foreground" />
          {visibleSelectedRegions.map((region) => (
            <ComboboxChip key={region.id} className="max-w-36 shrink-0">
              <span className="truncate">{region.name}</span>
            </ComboboxChip>
          ))}
          {hiddenSelectedRegionCount > 0 ? (
            <ComboboxChip showRemove={false} className="shrink-0 text-muted-foreground">
              +{hiddenSelectedRegionCount}
            </ComboboxChip>
          ) : null}
          <ComboboxChipsInput
            aria-label={t("labels.region")}
            className={selectedRegions.length === 0 ? "min-w-0" : "w-2 min-w-2 flex-none"}
            placeholder={selectedRegions.length === 0 ? t("labels.allRegions") : ""}
          />
        </ComboboxChips>
        <ComboboxContent anchor={chipsRef}>
          <ComboboxList>
            <ComboboxEmpty>{t("placeholder.noRegionsFound")}</ComboboxEmpty>
            {regions.map((region) => (
              <ComboboxItem key={region.id} value={region}>
                {region.name}
              </ComboboxItem>
            ))}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {hiddenSelectedRegionCount > 0 ? (
        <p className="mt-1.5 text-xs leading-4 text-muted-foreground">{selectedRegionItems.map((region) => region.name).join(", ")}</p>
      ) : null}
    </>
  );
}

export function MobileFilterRailInline({ children }: { children: ReactNode }) {
  return (
    <div className="relative mb-2 w-full min-w-0 shrink-0 after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-6 after:bg-gradient-to-l after:from-background after:to-transparent">
      <div className="scrollbar-hide overflow-x-auto overflow-y-hidden pr-8">
        <div className="w-max">{children}</div>
      </div>
    </div>
  );
}
