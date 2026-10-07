import {
  type KeyboardEvent,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import type { EditKind, FieldTarget } from "../../model/types";
import { type EditScope, editScopeProps, findEditTargetHolder, focusEditTarget } from "./editTargets";
import { type TopBarPlacement, useTopBarPlacement } from "./topBarActions";
import { useNavActionTarget } from "@/contexts/navActions";
import { useColumnRoom } from "@/hooks/useColumnRoom";
import { useIsMobile } from "@/hooks/useMobile";
import { cn } from "@/lib/utils";

type EditTier = "columns" | "tabs" | "stack";

export type EditPageCard = {
  id: string;
  label: string;
  tab?: string;
  count?: number;
  scopes?: readonly EditScope[];
  isBeforeCells?: boolean;
  node: ReactNode;
};

type RevealRequest = {
  token: number;
  target: FieldTarget;
};

type EditPageApi = {
  isPhone: boolean;
  revealRequest: RevealRequest | null;
  reveal: (target: FieldTarget) => void;
};

type EditPageProps = {
  kind: EditKind;
  head?: ReactNode;
  strips?: ReactNode;
  actions?: ReactNode;
  cards: readonly EditPageCard[];
  cells: ReactNode;
  cellCount?: number;
  cellsLead?: ReactNode;
  leftFooter?: ReactNode;
};

type PageTab = {
  id: string;
  label: string;
  count: number;
  isBeforeCells: boolean;
};

type TabStripProps = {
  tabs: readonly PageTab[];
  activeTabId: string;
  idPrefix: string;
  isPhone: boolean;
  onSelect: (tabId: string) => void;
};

type LayoutClasses = {
  body: string;
  left: string;
  cells: string;
  footer: string;
};

const CELLS_TAB_ID = "cells";
const TAB_PANEL_ATTRIBUTE = "data-edit-tab-panel";
const CELL_SCOPES: readonly EditScope[] = ["cell", "areaCode"];
const NO_SCOPES: readonly EditScope[] = [];
const LEFT_MIN_WIDTHS: Record<EditKind, number> = { editor: 364, review: 364, form: 380 };
const LEFT_MAX_WIDTH = 716;
const LEFT_SHARE = "38%";
const CELLS_MIN_WIDTHS: Record<EditKind, number> = { editor: 776, review: 776, form: 748 };
const COLUMN_GAPS: Record<EditKind, number> = { editor: 12, review: 12, form: 16 };
const COLUMNS_BODY_CLASSES: Record<EditKind, string> = { editor: "gap-3 pl-3", review: "gap-3 pl-3", form: "gap-4 pl-4" };
const LEFT_COLUMN_CLASSES: Record<EditKind, string> = { editor: "gap-3 pt-3", review: "gap-2 pt-3", form: "gap-4 pt-4" };
const CELLS_COLUMN_CLASSES: Record<EditKind, string> = { editor: "pt-3 pr-3", review: "pt-3 pr-3", form: "pt-4 pr-4" };
const FLOW_BODY_CLASSES: Record<EditKind, string> = { editor: "gap-3 p-3", review: "gap-2 p-3", form: "gap-4 p-4" };
const END_CLASSES: Record<TopBarPlacement, string> = { header: "pb-6", inline: "pb-6", floating: "pb-16 max-md:pb-28" };
const FOOTER_END_CLASSES: Record<TopBarPlacement, string> = { header: "pb-3", inline: "pb-3", floating: "pb-16" };
const SCROLLER_CLASS = "custom-scrollbar overflow-y-auto";
const SLOT_CLASS = "min-w-0 shrink-0 outline-none";
const ACTIONS_ROW_CLASS = "flex shrink-0 justify-end border-b px-3 py-1.5 empty:hidden";
const FOOTER_CLASS = "shrink-0 border-t bg-background pt-3";
const STICKY_FOOTER_CLASS = "sticky bottom-0 z-[8] mt-auto";
const TAB_LIST_CLASS = "inline-flex h-8 w-max shrink-0 items-center rounded-lg bg-muted p-[3px] text-muted-foreground";
const TAB_CLASS = cn(
  "inline-flex h-[calc(100%-1px)] shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-0.5",
  "text-sm font-medium whitespace-nowrap outline-none transition-colors",
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
);
const ACTIVE_TAB_CLASS = "bg-background text-foreground shadow-sm dark:border-input dark:bg-input/30";
const IDLE_TAB_CLASS = "text-foreground/60 hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground";
const TAB_COUNT_CLASS = "text-xs font-normal text-muted-foreground tabular-nums";

function ignoreReveal(): void {}

const EditPageContext = createContext<EditPageApi>({ isPhone: false, revealRequest: null, reveal: ignoreReveal });

export function useEditPage(): EditPageApi {
  return useContext(EditPageContext);
}

export function useNewReveal(): FieldTarget | null {
  const { revealRequest } = useEditPage();
  const token = revealRequest?.token ?? 0;
  const [seenToken, setSeenToken] = useState(token);
  if (seenToken === token) return null;

  setSeenToken(token);
  return revealRequest?.target ?? null;
}

export function useRevealedOpen(scope: EditScope): [boolean, (isOpen: boolean) => void] {
  const revealedTarget = useNewReveal();
  const [isOpen, setIsOpen] = useState(true);

  if (revealedTarget?.scope === scope) setIsOpen(true);
  return [isOpen, setIsOpen];
}

function useFloatingNavCover(isFooterShown: boolean) {
  const target = useNavActionTarget();
  const footerRef = useRef<HTMLDivElement>(null);
  const [isFooterCovered, setIsFooterCovered] = useState(true);

  useLayoutEffect(() => {
    const footer = footerRef.current;
    const nav = target?.closest("nav") ?? null;
    if (!isFooterShown || footer === null || nav === null) return;

    const measureCover = () => {
      const footerBox = footer.getBoundingClientRect();
      const navBox = nav.getBoundingClientRect();
      setIsFooterCovered(footerBox.left < navBox.right && navBox.left < footerBox.right);
    };
    const observer = new ResizeObserver(measureCover);
    measureCover();
    observer.observe(footer);
    observer.observe(nav);
    window.addEventListener("resize", measureCover);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measureCover);
    };
  }, [isFooterShown, target]);

  return { footerRef, isFooterCovered };
}

function getTier(kind: EditKind, isPhone: boolean, hasColumnRoom: boolean): EditTier {
  if (isPhone) return kind === "form" ? "stack" : "tabs";
  return hasColumnRoom ? "columns" : "tabs";
}

function getLeftWidth(kind: EditKind): string {
  const reservedWidth = CELLS_MIN_WIDTHS[kind] + COLUMN_GAPS[kind] * 2;
  return `max(${LEFT_MIN_WIDTHS[kind]}px, min(${LEFT_SHARE}, ${LEFT_MAX_WIDTH}px, calc(100% - ${reservedWidth}px)))`;
}

function getLayoutClasses(
  kind: EditKind,
  tier: EditTier,
  hasFooter: boolean,
  placement: TopBarPlacement,
  footerPlacement: TopBarPlacement,
): LayoutClasses {
  const endClass = END_CLASSES[placement];
  const stickyFooterClass = cn(STICKY_FOOTER_CLASS, FOOTER_END_CLASSES[footerPlacement]);

  if (tier === "columns") {
    return {
      body: COLUMNS_BODY_CLASSES[kind],
      left: cn("flex shrink-0 flex-col", SCROLLER_CLASS, LEFT_COLUMN_CLASSES[kind], hasFooter ? "pb-0" : endClass),
      cells: cn("flex-1", SCROLLER_CLASS, CELLS_COLUMN_CLASSES[kind], endClass),
      footer: cn(FOOTER_CLASS, stickyFooterClass),
    };
  }

  const isTabbed = tier === "tabs";
  return {
    body: cn("flex-col", SCROLLER_CLASS, FLOW_BODY_CLASSES[kind], isTabbed && hasFooter ? "pb-0" : endClass),
    left: "contents",
    cells: "shrink-0",
    footer: cn(FOOTER_CLASS, "order-last", isTabbed ? stickyFooterClass : null),
  };
}

function getTabId(card: EditPageCard): string {
  return card.tab ?? card.id;
}

function getTabElementId(idPrefix: string, tabId: string): string {
  return `${idPrefix}-tab-${tabId}`;
}

function getPanelProps(idPrefix: string, tabId: string, isTabbed: boolean) {
  return {
    role: isTabbed ? "tabpanel" : undefined,
    "aria-labelledby": isTabbed ? getTabElementId(idPrefix, tabId) : undefined,
    tabIndex: -1,
    [TAB_PANEL_ATTRIBUTE]: tabId,
  };
}

function listCardTabs(cards: readonly EditPageCard[]): PageTab[] {
  const tabs = new Map<string, PageTab>();

  for (const card of cards) {
    const tabId = getTabId(card);
    const tab = tabs.get(tabId) ?? { id: tabId, label: card.label, count: 0, isBeforeCells: card.isBeforeCells === true };
    tab.count += card.count ?? 0;
    tabs.set(tabId, tab);
  }
  return [...tabs.values()];
}

function listTabs(cards: readonly EditPageCard[], cellsLabel: string, cellCount: number): PageTab[] {
  const cardTabs = listCardTabs(cards);
  const cellsTab: PageTab = { id: CELLS_TAB_ID, label: cellsLabel, count: cellCount, isBeforeCells: false };

  return [...cardTabs.filter((tab) => tab.isBeforeCells), cellsTab, ...cardTabs.filter((tab) => !tab.isBeforeCells)];
}

function findActiveTabId(cards: readonly EditPageCard[], pickedTabId: string | null): string {
  if (pickedTabId === CELLS_TAB_ID) return CELLS_TAB_ID;

  const cardTabs = listCardTabs(cards);
  const pickedTab = cardTabs.find((tab) => tab.id === pickedTabId);
  const tabBeforeCells = cardTabs.find((tab) => tab.isBeforeCells);
  return (pickedTab ?? tabBeforeCells)?.id ?? CELLS_TAB_ID;
}

function findScopeTabId(cards: readonly EditPageCard[], scope: EditScope): string | null {
  if (CELL_SCOPES.includes(scope)) return CELLS_TAB_ID;

  const card = cards.find((candidate) => candidate.scopes?.includes(scope) === true);
  return card === undefined ? null : getTabId(card);
}

function getNextTabIndex(key: string, index: number, count: number): number | null {
  if (key === "ArrowRight") return (index + 1) % count;
  if (key === "ArrowLeft") return (index - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

function TabStrip({ tabs, activeTabId, idPrefix, isPhone, onSelect }: TabStripProps) {
  const { t } = useTranslation("stations");

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((tab) => tab.id === activeTabId);
    const nextIndex = getNextTabIndex(event.key, index, tabs.length);
    const nextTab = nextIndex === null ? undefined : tabs.at(nextIndex);
    if (nextTab === undefined) return;

    event.preventDefault();
    onSelect(nextTab.id);
    document.getElementById(getTabElementId(idPrefix, nextTab.id))?.focus();
  }

  return (
    <div className={cn("scrollbar-hide flex h-11 shrink-0 items-center overflow-x-auto border-b", isPhone ? "px-2" : "px-3")}>
      <div role="tablist" aria-label={t("edit.frame.tabs")} onKeyDown={handleKeyDown} className={TAB_LIST_CLASS}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={getTabElementId(idPrefix, tab.id)}
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onSelect(tab.id)}
              className={cn(TAB_CLASS, isActive ? ACTIVE_TAB_CLASS : IDLE_TAB_CLASS)}
            >
              {tab.label}
              {tab.count > 0 ? <span className={TAB_COUNT_CLASS}>{tab.count}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function EditPage({ kind, head, strips, actions, cards, cells, cellCount = 0, cellsLead, leftFooter }: EditPageProps) {
  const { t } = useTranslation("common");
  const idPrefix = useId();
  const isPhone = useIsMobile();
  const placement = useTopBarPlacement();
  const hasFooter = leftFooter !== undefined && leftFooter !== null;
  const { footerRef, isFooterCovered } = useFloatingNavCover(hasFooter);
  const { rootRef, hasColumnRoom } = useColumnRoom(LEFT_MIN_WIDTHS[kind] + CELLS_MIN_WIDTHS[kind] + COLUMN_GAPS[kind] * 3);
  const bodyRef = useRef<HTMLDivElement>(null);
  const scrollTops = useRef(new Map<string, number>());
  const [pickedTabId, setPickedTabId] = useState<string | null>(null);
  const [revealRequest, setRevealRequest] = useState<RevealRequest | null>(null);
  const tier = getTier(kind, isPhone, hasColumnRoom);
  const activeTabId = findActiveTabId(cards, pickedTabId);
  const latestPage = useRef({ cards, tier, activeTabId });

  useLayoutEffect(() => {
    latestPage.current = { cards, tier, activeTabId };
  });

  useLayoutEffect(() => {
    if (tier !== "tabs") return;

    const panel = document.activeElement?.closest<HTMLElement>(`[${TAB_PANEL_ATTRIBUTE}]`) ?? null;
    const focusedTabId = panel?.getAttribute(TAB_PANEL_ATTRIBUTE) ?? null;
    if (panel !== null && focusedTabId !== null && rootRef.current?.contains(panel) === true) setPickedTabId(focusedTabId);
  }, [tier, rootRef]);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (body !== null && tier === "tabs") body.scrollTop = scrollTops.current.get(activeTabId) ?? 0;
  }, [activeTabId, tier]);

  useEffect(() => {
    const root = rootRef.current;
    if (revealRequest === null || root === null) return;

    const frame = requestAnimationFrame(() => focusEditTarget(root, revealRequest.target));
    return () => cancelAnimationFrame(frame);
  }, [revealRequest, rootRef]);

  const selectTab = useCallback((tabId: string) => {
    const body = bodyRef.current;
    const page = latestPage.current;
    if (body !== null && page.tier === "tabs") scrollTops.current.set(page.activeTabId, body.scrollTop);
    setPickedTabId(tabId);
  }, []);

  const reveal = useCallback(
    (target: FieldTarget) => {
      const root = rootRef.current;
      const page = latestPage.current;
      const holderTabId = root === null ? null : findEditTargetHolder(root, target, TAB_PANEL_ATTRIBUTE);
      const tabId = findScopeTabId(page.cards, target.scope) ?? holderTabId;
      if (tabId !== null && page.tier === "tabs") selectTab(tabId);
      setRevealRequest((known) => ({ token: (known?.token ?? 0) + 1, target }));
    },
    [rootRef, selectTab],
  );

  const isTabbed = tier === "tabs";
  const isSplit = tier === "columns";
  const footerPlacement = placement === "floating" && !isFooterCovered ? "inline" : placement;
  const layout = getLayoutClasses(kind, tier, hasFooter, placement, footerPlacement);

  return (
    <EditPageContext.Provider value={{ isPhone, revealRequest, reveal }}>
      <div ref={rootRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {actions === undefined ? null : <div className={ACTIONS_ROW_CLASS}>{actions}</div>}
        {head}
        {strips}
        {isTabbed ? (
          <TabStrip
            tabs={listTabs(cards, t("labels.cells"), cellCount)}
            activeTabId={activeTabId}
            idPrefix={idPrefix}
            isPhone={isPhone}
            onSelect={selectTab}
          />
        ) : null}
        <div ref={bodyRef} className={cn("flex min-h-0 flex-1", layout.body)}>
          <div className={layout.left} style={isSplit ? { width: getLeftWidth(kind) } : undefined}>
            {cards.map((card) => {
              const tabId = getTabId(card);
              return (
                <div
                  key={card.id}
                  {...getPanelProps(idPrefix, tabId, isTabbed)}
                  {...editScopeProps(card.scopes ?? NO_SCOPES)}
                  className={cn(SLOT_CLASS, isTabbed && tabId !== activeTabId ? "hidden" : null)}
                >
                  {card.node}
                </div>
              );
            })}
            {hasFooter ? (
              <div ref={footerRef} className={layout.footer}>
                {leftFooter}
              </div>
            ) : null}
          </div>
          <div
            {...getPanelProps(idPrefix, CELLS_TAB_ID, isTabbed)}
            {...editScopeProps(CELL_SCOPES)}
            className={cn("min-w-0 outline-none", layout.cells, isTabbed && activeTabId !== CELLS_TAB_ID ? "hidden" : null)}
          >
            {isTabbed ? cellsLead : null}
            {cells}
          </div>
        </div>
      </div>
    </EditPageContext.Provider>
  );
}
