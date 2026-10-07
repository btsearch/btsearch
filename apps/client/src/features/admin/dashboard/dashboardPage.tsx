import type { Settings } from "@openbts/shared/contract";
import { useTranslation } from "react-i18next";

import { AuditCard } from "./cards/auditCard";
import { CommentsCard } from "./cards/commentsCard";
import type { DashboardLayout, QueueSwitch } from "./cards/dashboardCard";
import { DatabaseCard } from "./cards/databaseCard";
import { ImportCard } from "./cards/importCard";
import { NotesCard } from "./cards/notesCard";
import { SubmissionsCard } from "./cards/submissionsCard";
import { type DashboardAccess, useDashboardAccess } from "./useDashboardAccess";
import { InlineError } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { type MapLookups, useMapLookups } from "@/features/map/data/mapLookups";
import { describeArea, hasRegionLimits } from "@/features/stations/list/data/editorArea";
import { useColumnRoom } from "@/hooks/useColumnRoom";
import { useIsMobile } from "@/hooks/useMobile";
import { useNavMode } from "@/hooks/usePreferences";
import { useSettings } from "@/hooks/useSettings";
import { hasFailedLoad } from "@/lib/queryLoadState";
import { cn } from "@/lib/utils";

type QueueFeature = "submissions" | "commentReview";

type AreaLineProps = {
  access: DashboardAccess;
  lookups: MapLookups | undefined;
  haveLookupsFailed: boolean;
};

const COLUMNS_MIN_WIDTH = 1024;
const AREA_LINE_CLASS = "mt-1 text-sm text-muted-foreground";

function readQueueSwitch(settings: Settings | undefined, hasSettingsFailed: boolean, feature: QueueFeature): QueueSwitch {
  if (settings === undefined) return hasSettingsFailed ? "on" : "unknown";
  return settings.features[feature] ? "on" : "off";
}

function AreaLine({ access, lookups, haveLookupsFailed }: AreaLineProps) {
  const { t, i18n } = useTranslation("admin");
  const { area } = access;

  if (access.hasAreaFailed) return <InlineError size="sm" className="mt-1 w-fit" onRetry={access.retryArea} isRetrying={access.isAreaRetrying} />;
  if (area === undefined || (lookups === undefined && !haveLookupsFailed && hasRegionLimits(area))) {
    return <Skeleton className="mt-1 h-5 w-56" aria-hidden="true" />;
  }
  if (area.coversEverything) return <p className={AREA_LINE_CLASS}>{t("auditLogs.filters.allCountries")}</p>;
  if (area.regionIdsByCountry.size === 0) return <p className={AREA_LINE_CLASS}>{t("dashboard.noArea")}</p>;
  return <p className={AREA_LINE_CLASS}>{t("dashboard.area", { area: describeArea(area, lookups, i18n.language) })}</p>;
}

export function DashboardPage() {
  const { t } = useTranslation("nav");
  const isMobile = useIsMobile();
  const navMode = useNavMode();
  const { rootRef, hasColumnRoom } = useColumnRoom<HTMLElement>(COLUMNS_MIN_WIDTH);
  const access = useDashboardAccess();
  const { lookups, isError: haveLookupsFailed } = useMapLookups();
  const settingsQuery = useSettings();

  const layout: DashboardLayout = !isMobile && hasColumnRoom ? "columns" : "stack";
  const isColumns = layout === "columns";
  const hasSettingsFailed = hasFailedLoad(settingsQuery);
  const { isAdmin, area, lowerCard } = access;
  const countryCount = area?.coversEverything === true ? (lookups?.countries.length ?? 0) : (area?.regionIdsByCountry.size ?? 0);
  const columnClass = cn("flex min-w-0 flex-col gap-3", isColumns ? "min-h-0" : null);
  const lowerCardClass = isColumns ? "flex-[3]" : undefined;
  const stackScrollClass = cn("custom-scrollbar overflow-y-auto", navMode === "floating" ? "pb-32" : "pb-3");

  return (
    <main ref={rootRef} className={cn("flex min-h-0 flex-1 flex-col gap-3 px-3 pt-3", isColumns ? "overflow-hidden pb-3" : stackScrollClass)}>
      <header className="shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">{t("items.dashboard")}</h1>
        <AreaLine access={access} lookups={lookups} haveLookupsFailed={haveLookupsFailed} />
      </header>

      <div
        className={
          isColumns ? "grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,0.65fr)_300px] grid-rows-[minmax(0,1fr)] gap-3" : "flex flex-col gap-3"
        }
      >
        <SubmissionsCard
          layout={layout}
          queueSwitch={readQueueSwitch(settingsQuery.data, hasSettingsFailed, "submissions")}
          isAdmin={isAdmin}
          showsCountries={countryCount > 1}
          lookups={lookups}
        />

        <div className={columnClass}>
          <CommentsCard
            layout={layout}
            queueSwitch={readQueueSwitch(settingsQuery.data, hasSettingsFailed, "commentReview")}
            isAdmin={isAdmin}
            lookups={lookups}
            className={isColumns ? "flex-[5]" : undefined}
          />
          {lowerCard === "audit" ? <AuditCard layout={layout} lookups={lookups} className={lowerCardClass} /> : null}
          {lowerCard === "notes" ? <NotesCard layout={layout} className={lowerCardClass} /> : null}
          {lowerCard === "pending" ? <Skeleton className={cn("rounded-xl", isColumns ? "min-h-0 flex-[3]" : "h-56")} aria-hidden="true" /> : null}
        </div>

        <div className={columnClass}>
          <DatabaseCard layout={layout} className={isColumns ? "flex-1" : undefined} />
          {isAdmin ? <ImportCard /> : null}
        </div>
      </div>
    </main>
  );
}
