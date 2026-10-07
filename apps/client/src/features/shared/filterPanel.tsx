import { Cancel01Icon, Location01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { type ComponentProps, type FocusEventHandler, type ReactNode, type Ref, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
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
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";
import { cn } from "@/lib/utils";
import type { Region } from "@/types/station";

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

const FACET_PILL_CLASS =
  "inline-flex h-7 items-center gap-1.5 rounded-full border border-transparent px-2.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring";
const FACET_PILL_ACTIVE_CLASS = "bg-primary text-primary-foreground";
const FACET_PILL_INACTIVE_CLASS = "bg-foreground/5 text-foreground/80 hover:bg-foreground/10 hover:text-foreground";
const FACET_PILL_QUIET_CLASS = "cursor-pointer bg-transparent text-muted-foreground tabular-nums hover:bg-foreground/5 hover:text-foreground";
const FACET_PILL_OPEN_CLASS = "bg-foreground/10 text-foreground";

export const FILTER_COUNT_BADGE_CLASS = cn(
  "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5",
  "text-[11px] font-semibold leading-none text-primary-foreground",
);
export const FILTER_CLEAR_ALL_CLASS = "min-w-0 cursor-pointer truncate text-xs text-muted-foreground transition-colors hover:text-foreground";

export function FacetPill({
  active,
  onClick,
  label,
  className,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(FACET_PILL_CLASS, active ? FACET_PILL_ACTIVE_CLASS : FACET_PILL_INACTIVE_CLASS, className)}
    >
      {children}
    </button>
  );
}

type FacetDisclosureTone = "quiet" | "filled";

function getFacetDisclosureToneClass(tone: FacetDisclosureTone, expanded: boolean): string {
  if (tone === "quiet") return FACET_PILL_QUIET_CLASS;
  return expanded ? FACET_PILL_OPEN_CLASS : FACET_PILL_INACTIVE_CLASS;
}

export function FacetDisclosurePill({
  expanded,
  onClick,
  label,
  title,
  tone = "quiet",
  className,
  children,
}: {
  expanded: boolean;
  onClick: () => void;
  label?: string;
  title?: string;
  tone?: FacetDisclosureTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-label={label}
      title={title}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(FACET_PILL_CLASS, getFacetDisclosureToneClass(tone, expanded), className)}
    >
      {children}
    </button>
  );
}

const TONE_FACET_PILL_INACTIVE_CLASS = "bg-foreground/5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground";
const FACET_COUNTRY_MARK_CLASS = "inline-flex h-4 items-center rounded-[5px] px-1 font-sans text-[9px] font-bold tracking-[0.04em]";

export function ToneFacetPill({
  isActive,
  icon,
  activeClassName,
  iconClassName,
  label,
  onClick,
  children,
}: {
  isActive: boolean;
  icon: IconSvgElement;
  activeClassName: string;
  iconClassName?: string;
  label?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={isActive}
      aria-label={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(FACET_PILL_CLASS, isActive ? activeClassName : TONE_FACET_PILL_INACTIVE_CLASS)}
    >
      <HugeiconsIcon icon={icon} className={cn("size-3 shrink-0", isActive ? null : iconClassName)} />
      {children}
    </button>
  );
}

export function FacetCount({ count, isActive }: { count: number; isActive: boolean }) {
  const { i18n } = useTranslation();

  return (
    <span className={cn("font-normal tabular-nums", isActive ? "text-primary-foreground/75" : "text-muted-foreground")}>
      {count.toLocaleString(i18n.language)}
    </span>
  );
}

export function FacetCountryMark({ countryCode, isActive }: { countryCode: string; isActive: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        FACET_COUNTRY_MARK_CLASS,
        isActive ? "bg-primary-foreground/15 text-primary-foreground" : "bg-foreground/10 text-muted-foreground",
      )}
    >
      {countryCode}
    </span>
  );
}

export function KbdHint({ children }: { children: ReactNode }) {
  return (
    <kbd className="hidden shrink-0 items-center rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px] leading-none text-foreground md:inline-flex">
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
  size?: FilterSearchSize;
  className?: string;
};

type FilterSearchSize = "default" | "sm";

const FILTER_SEARCH_FIELD_CLASS = cn(
  "flex w-full min-w-0 items-center gap-2 rounded-lg border border-input bg-transparent pl-3 pr-1.5 transition-colors",
  "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30",
);
const FILTER_SEARCH_HEIGHT_CLASSES: Record<FilterSearchSize, string> = { default: "h-9", sm: "h-8" };

export function FilterSearchShell({
  hasValue,
  onClear,
  children,
  overlay,
  containerRef,
  onBlur,
  size = "default",
  className,
}: FilterSearchShellProps) {
  const { t } = useTranslation("common");

  return (
    <search ref={containerRef} onBlur={onBlur} className={cn("relative", className)}>
      <div className={cn(FILTER_SEARCH_FIELD_CLASS, FILTER_SEARCH_HEIGHT_CLASSES[size])}>
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
      {...NO_AUTOFILL_PROPS}
      spellCheck={false}
      className={cn("h-full min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground", className)}
      {...props}
    />
  );
}

type RegionComboboxProps = {
  regions: Region[];
  selectedRegions: number[];
  onChange: (regionIds: number[]) => void;
  placeholder?: string;
  invalid?: boolean;
};

export function RegionCombobox({ regions, selectedRegions, onChange, placeholder, invalid = false }: RegionComboboxProps) {
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
      <Combobox
        multiple
        value={selectedRegionItems}
        onValueChange={(values) => onChange(values.map((region) => region.id))}
        items={regions}
        itemToStringLabel={(region) => region.name}
      >
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
            aria-invalid={invalid || undefined}
            className={selectedRegions.length === 0 ? "min-w-0" : "w-2 min-w-2 flex-none"}
            placeholder={selectedRegions.length === 0 ? (placeholder ?? t("labels.allRegions")) : ""}
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

export function ClearFiltersButton({ count, onClick, className }: { count: number; onClick: () => void; className?: string }) {
  const { t } = useTranslation("common");

  return (
    <Button type="button" variant="ghost" size="sm" className={cn("text-muted-foreground", className)} onClick={onClick}>
      <HugeiconsIcon icon={Cancel01Icon} className="size-3" data-icon="inline-start" />
      {t("actions.clearAll")}
      <span aria-hidden="true" className="ml-1 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-bold leading-none text-muted-foreground">
        {count}
      </span>
    </Button>
  );
}

export function MobileFilterRailInline({ children }: { children: ReactNode }) {
  return (
    <div className="relative mb-2 w-full min-w-0 shrink-0 after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-6 after:bg-linear-to-l after:from-background after:to-transparent">
      <div className="scrollbar-hide overflow-x-auto overflow-y-hidden pr-8">
        <div className="w-max">{children}</div>
      </div>
    </div>
  );
}

type MobileFilterRailFloatingProps = {
  target: HTMLElement;
  hasEdgeFade?: boolean;
  children: ReactNode;
};

const FLOATING_RAIL_CLASS = "w-[calc(100vw-1.5rem)] min-w-0 md:hidden";
const FLOATING_RAIL_FADE_CLASS = cn(
  "relative after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-10",
  "after:bg-linear-to-l after:from-background after:to-transparent",
);

export function MobileFilterRailFloating({ target, hasEdgeFade = false, children }: MobileFilterRailFloatingProps) {
  return createPortal(
    <div className={cn(FLOATING_RAIL_CLASS, hasEdgeFade ? FLOATING_RAIL_FADE_CLASS : null)}>
      <div className={cn("scrollbar-hide overflow-x-auto overflow-y-hidden", hasEdgeFade ? "pr-10" : null)}>
        <div className={cn("w-max", hasEdgeFade ? null : "mx-auto")}>{children}</div>
      </div>
    </div>,
    target,
  );
}
