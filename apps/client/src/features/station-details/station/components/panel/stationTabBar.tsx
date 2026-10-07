import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import type { TAB_OPTIONS, TabId } from "../../../tabs";
import { cn } from "@/lib/utils";

const TAB_GAP_REM = 0.25;

type StationTab = (typeof TAB_OPTIONS)[number];

type StationTabBarProps = {
  tabs: readonly StationTab[];
  activeTab: TabId;
  counts: Partial<Record<TabId, number>>;
  onTabChange: (tab: TabId) => void;
};

export function StationTabBar({ tabs, activeTab, counts, onTabChange }: StationTabBarProps) {
  const { t } = useTranslation("stationDetails");
  const tabCount = Math.max(tabs.length, 1);
  const activeTabIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === activeTab),
  );
  const thumbInsetRem = 0.5 + (tabCount - 1) * TAB_GAP_REM;
  const thumbTransform =
    activeTabIndex === 0 ? "translate3d(0, 0, 0)" : `translate3d(calc(${activeTabIndex * 100}% + ${activeTabIndex * TAB_GAP_REM}rem), 0, 0)`;

  return (
    <div
      className="relative grid gap-1 rounded-full bg-muted/60 p-1 ring-1 ring-inset ring-border/50"
      style={{ gridTemplateColumns: `repeat(${tabCount}, minmax(0, 1fr))` }}
    >
      {tabs.length > 0 ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-1 bottom-1 left-1 rounded-full bg-background shadow-sm transition-transform duration-200 ease-out motion-reduce:transition-none"
          style={{ width: `calc((100% - ${thumbInsetRem}rem) / ${tabCount})`, transform: thumbTransform }}
        />
      ) : null}
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        const count = counts[tab.id];

        return (
          <button
            type="button"
            key={tab.id}
            aria-current={isActive ? "true" : undefined}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "relative flex min-w-0 items-center justify-center gap-2 rounded-full px-2 py-2 text-sm font-medium transition-colors duration-200 sm:px-3",
              isActive ? "cursor-default text-primary" : "cursor-pointer text-muted-foreground hover:bg-background/40 hover:text-foreground",
            )}
          >
            <HugeiconsIcon icon={tab.icon} className="size-5 sm:size-4" aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">{t(tab.labelKey)}</span>
            {count !== undefined && count > 0 ? (
              <span className="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full text-xs font-bold bg-primary text-primary-foreground leading-none animate-in fade-in zoom-in-50 duration-200">
                {count > 99 ? "99+" : count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
