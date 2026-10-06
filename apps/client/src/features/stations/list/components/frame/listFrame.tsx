import { FilterIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence } from "motion/react";
import { type ReactNode, useId, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ListFilterPanel } from "./listFilterPanel";
import { rememberListPanelHidden, useIsListPanelKeptHidden } from "./listPanelMemory";
import { FLOATING_NAV_ACTION_TARGET_ID } from "@/components/layout/floatingNav";
import { Button } from "@/components/ui/button";
import { useNavActionTarget } from "@/contexts/navActions";
import { GrowItem, Reveal } from "@/features/map/components/search-overlay/mapFilterMotion";
import { MobileFilterRailFloating, MobileFilterRailInline } from "@/features/shared/filterPanel";
import { useIsMobile } from "@/hooks/useMobile";
import { cn } from "@/lib/utils";

type ListTitleRowProps = {
  title: string;
  count?: ReactNode;
  action?: ReactNode;
  className?: string;
};

type ListFrameProps = {
  title: string;
  count?: ReactNode;
  action?: ReactNode;
  search: ReactNode;
  searchNote?: ReactNode;
  panel: ReactNode;
  mobileFilters?: ReactNode;
  mobileLead?: ReactNode;
  activeFilterCount: number;
  onClearFilters: () => void;
  narrowestTableWidth?: number;
  children: ReactNode;
};

const PANEL_WIDTH = 288;
const MAIN_SIDE_PADDING = 24;
const DEFAULT_NARROWEST_TABLE_WIDTH = 750;
const SHOW_BUTTON_BADGE_CLASS = cn(
  "inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-primary px-1.25",
  "text-[11px] font-semibold leading-none text-primary-foreground",
);

function hasContent(node: ReactNode): boolean {
  return node !== undefined && node !== null && node !== false;
}

function usePanelRoom(narrowestAreaWidth: number) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [hasPanelRoom, setHasPanelRoom] = useState<boolean | null>(null);

  useLayoutEffect(() => {
    const area = areaRef.current;
    if (area === null) return;

    const measureArea = () => setHasPanelRoom(area.clientWidth >= narrowestAreaWidth);
    const observer = new ResizeObserver(measureArea);
    measureArea();
    observer.observe(area);
    return () => observer.disconnect();
  }, [narrowestAreaWidth]);

  return { areaRef, hasPanelRoom };
}

export function ListTitleRow({ title, count, action, className }: ListTitleRowProps) {
  return (
    <header className={cn("flex min-h-8 shrink-0 items-center gap-2.5", className)}>
      <div className="flex min-w-0 flex-col md:flex-row md:items-center md:gap-2.5">
        <h1 className="truncate text-lg font-semibold tracking-tight">{title}</h1>
        {count === undefined ? null : (
          <div aria-live="polite" className="truncate text-xs leading-4 text-muted-foreground tabular-nums md:text-sm md:leading-5">
            {count}
          </div>
        )}
      </div>
      {hasContent(action) ? <div className="ml-auto flex shrink-0 items-center gap-2">{action}</div> : null}
    </header>
  );
}

export function ListFrame({
  title,
  count,
  action,
  search,
  searchNote,
  panel,
  mobileFilters,
  mobileLead,
  activeFilterCount,
  onClearFilters,
  narrowestTableWidth = DEFAULT_NARROWEST_TABLE_WIDTH,
  children,
}: ListFrameProps) {
  const { t } = useTranslation("common");
  const panelId = useId();
  const isMobile = useIsMobile();
  const navActionTarget = useNavActionTarget();
  const isPanelKeptHidden = useIsListPanelKeptHidden();
  const hideButtonRef = useRef<HTMLButtonElement>(null);
  const showButtonRef = useRef<HTMLButtonElement>(null);
  const [isPanelOpenWithoutRoom, setIsPanelOpenWithoutRoom] = useState(false);
  const { areaRef, hasPanelRoom } = usePanelRoom(PANEL_WIDTH + MAIN_SIDE_PADDING + narrowestTableWidth);

  const hasPanel = !isMobile && hasPanelRoom !== null && hasContent(panel);
  const isPanelShown = hasPanelRoom === true ? !isPanelKeptHidden : isPanelOpenWithoutRoom;
  const hasSearchRow = hasPanel || hasContent(search);
  const isMobileRailFloating = navActionTarget?.id === FLOATING_NAV_ACTION_TARGET_ID;
  const hasMobileFilters = isMobile && hasContent(mobileFilters);
  const hasFloatingMobileFilters = hasMobileFilters && isMobileRailFloating;
  const hasMobileLead = isMobile && hasContent(mobileLead);
  const hasMobileLeadBelowContent = hasMobileLead && isMobileRailFloating;

  function setPanelShown(isShown: boolean, pressedButton: HTMLElement) {
    const nextButtonRef = isShown ? hideButtonRef : showButtonRef;
    const hadFocus = pressedButton === document.activeElement;

    if (hasPanelRoom === true) rememberListPanelHidden(!isShown);
    else setIsPanelOpenWithoutRoom(isShown);
    if (hadFocus) requestAnimationFrame(() => nextButtonRef.current?.focus());
  }

  return (
    <>
      <div ref={areaRef} className="flex min-h-0 flex-1 flex-row overflow-hidden">
        {hasPanel ? (
          <ListFilterPanel
            id={panelId}
            isShown={isPanelShown}
            activeFilterCount={activeFilterCount}
            hideButtonRef={hideButtonRef}
            onClearFilters={onClearFilters}
            onHide={(pressedButton) => setPanelShown(false, pressedButton)}
          >
            {panel}
          </ListFilterPanel>
        ) : null}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2.5 p-3">
          <ListTitleRow title={title} count={count} action={action} />

          {hasSearchRow ? (
            <div className="flex shrink-0 items-start [&_button]:cursor-pointer">
              {hasPanel ? (
                <div className="-my-1 -ml-1 flex shrink-0">
                  <AnimatePresence initial={false}>
                    {isPanelShown ? null : (
                      <GrowItem key="show-filters">
                        <span className="inline-flex p-1">
                          <Button
                            ref={showButtonRef}
                            type="button"
                            variant="outline"
                            size="lg"
                            className="px-3"
                            aria-expanded={false}
                            aria-controls={panelId}
                            onClick={(event) => setPanelShown(true, event.currentTarget)}
                          >
                            <HugeiconsIcon icon={FilterIcon} aria-hidden="true" />
                            {t("labels.filters")}
                            {activeFilterCount > 0 ? (
                              <span className={SHOW_BUTTON_BADGE_CLASS} aria-label={t("labels.filtersActive", { count: activeFilterCount })}>
                                {activeFilterCount}
                              </span>
                            ) : null}
                          </Button>
                        </span>
                      </GrowItem>
                    )}
                  </AnimatePresence>
                </div>
              ) : null}
              <div className={cn("min-w-0 flex-1", hasPanel ? "ml-1" : null)}>
                {search}
                <div role="status">
                  <Reveal shown={hasContent(searchNote)} className="pt-1.5">
                    {searchNote}
                  </Reveal>
                </div>
              </div>
            </div>
          ) : null}

          {hasMobileLead && !hasMobileLeadBelowContent ? <div className="min-w-0 shrink-0">{mobileLead}</div> : null}

          {hasMobileFilters && !hasFloatingMobileFilters ? (
            <div className="-mb-2 min-w-0 shrink-0">
              <MobileFilterRailInline>{mobileFilters}</MobileFilterRailInline>
            </div>
          ) : null}

          <div className={cn("flex min-h-0 flex-1 flex-col", hasFloatingMobileFilters && !hasMobileLeadBelowContent ? "mb-10" : null)}>
            {children}
          </div>

          {hasMobileLeadBelowContent ? <div className={cn("min-w-0 shrink-0", hasFloatingMobileFilters ? "mb-10" : null)}>{mobileLead}</div> : null}
        </div>
      </div>

      {hasFloatingMobileFilters && navActionTarget !== null ? (
        <MobileFilterRailFloating target={navActionTarget} hasEdgeFade>
          {mobileFilters}
        </MobileFilterRailFloating>
      ) : null}
    </>
  );
}
