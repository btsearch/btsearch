import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNavMode } from "@/hooks/usePreferences";
import { cn } from "@/lib/utils";

export type MeasurementsSection = "engine" | "uploads" | "contributors" | "blocks" | "evaluation";

type MeasurementsPageProps = {
  section: MeasurementsSection;
  isScrolling?: boolean;
  notice?: ReactNode;
  children: ReactNode;
};

const SECTION_LINKS = {
  engine: "/admin/measurements",
  uploads: "/admin/measurements/uploads",
  contributors: "/admin/measurements/contributors",
  blocks: "/admin/measurements/blocks",
  evaluation: "/admin/measurements/evaluation",
} as const satisfies Record<MeasurementsSection, string>;

const SECTIONS = ["engine", "uploads", "contributors", "blocks", "evaluation"] as const satisfies readonly MeasurementsSection[];

function MeasurementsTabs({ section }: { section: MeasurementsSection }) {
  const { t } = useTranslation("admin");

  return (
    <nav aria-label={t("measurements.tabs.label")} className="no-scrollbar -mx-3 shrink-0 overflow-x-auto px-3">
      <Tabs value={section}>
        <TabsList>
          {SECTIONS.map((key) => (
            <TabsTrigger key={key} value={key} nativeButton={false} render={<Link to={SECTION_LINKS[key]} />} className="flex-none cursor-pointer">
              {t(`measurements.tabs.${key}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </nav>
  );
}

export function MeasurementsPage({ section, isScrolling = true, notice, children }: MeasurementsPageProps) {
  const { t } = useTranslation(["admin", "nav"]);
  const navMode = useNavMode();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-3 pt-3">
      <header className="flex shrink-0 flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{t("nav:items.measurements")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground max-md:hidden">{t("measurements.description")}</p>
        </div>
        {notice}
      </header>
      <MeasurementsTabs section={section} />
      {isScrolling ? (
        <div className={cn("custom-scrollbar -mx-3 min-h-0 flex-1 overflow-y-auto px-3", navMode === "floating" ? "pb-32" : "pb-3")}>{children}</div>
      ) : (
        children
      )}
    </div>
  );
}
