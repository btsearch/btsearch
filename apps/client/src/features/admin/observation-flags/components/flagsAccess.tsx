import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { ErrorState, InlineError } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { SystemSettingsLink } from "@/features/admin/dashboard/cards/dashboardCard";
import { type MapLookups, useMapLookups } from "@/features/map/data/mapLookups";
import { type EditorArea, describeArea, hasRegionLimits, useEditorArea } from "@/features/stations/list/data/editorArea";
import { useSettings } from "@/hooks/useSettings";
import { useSettledSession } from "@/hooks/useSettledSession";
import { hasFailedLoad } from "@/lib/queryLoadState";

export type FlagsAccess =
  | { state: "loading" }
  | { state: "areaError"; isRetrying: boolean; retry: () => void }
  | { state: "noArea" }
  | { state: "off" }
  | { state: "ready"; isAdmin: boolean; isSwitchedOff: boolean; area: EditorArea };

type FlagsAccessStateProps = {
  access: Exclude<FlagsAccess, { state: "ready" }>;
  className?: string;
};

type FlagsAreaLineProps = {
  access: FlagsAccess;
};

export function useFlagsAccess(): FlagsAccess {
  const { data: session } = useSettledSession();
  const settingsQuery = useSettings();
  const { area, isError, isRetrying, retry } = useEditorArea();
  const isAdmin = session?.user?.role === "admin";
  const settings = settingsQuery.data;
  const isSwitchedOff = settings !== undefined && !settings.features.observations;

  if (settings === undefined && !hasFailedLoad(settingsQuery)) return { state: "loading" };
  if (isSwitchedOff && !isAdmin) return { state: "off" };
  if (isError) return { state: "areaError", isRetrying, retry };
  if (area === undefined) return { state: "loading" };
  if (!area.coversEverything && area.regionIdsByCountry.size === 0) return { state: "noArea" };
  return { state: "ready", isAdmin, isSwitchedOff, area };
}

function readAreaText(area: EditorArea, lookups: MapLookups | undefined, haveLookupsFailed: boolean, language: string): string | null {
  if (area.coversEverything) return null;
  if (lookups === undefined && !haveLookupsFailed && hasRegionLimits(area)) return null;
  return describeArea(area, lookups, language);
}

export function FlagsAreaLine({ access }: FlagsAreaLineProps) {
  const { t, i18n } = useTranslation("admin");
  const { lookups, isError: haveLookupsFailed } = useMapLookups();

  if (access.state === "noArea") return <p className="mt-1 text-sm text-muted-foreground">{t("dashboard.noArea")}</p>;
  if (access.state === "areaError") return <InlineError size="sm" className="mt-1 w-fit" onRetry={access.retry} isRetrying={access.isRetrying} />;
  if (access.state === "loading") return <Skeleton className="mt-1 h-5 w-72" aria-hidden="true" />;

  const areaText = access.state === "ready" ? readAreaText(access.area, lookups, haveLookupsFailed, i18n.language) : null;
  return (
    <p className="mt-1 text-sm text-muted-foreground">
      {t("observationFlags.description")}
      {areaText === null ? null : <>. {t("dashboard.area", { area: areaText })}</>}
    </p>
  );
}

export function FlagsAccessState({ access, className }: FlagsAccessStateProps) {
  const { t } = useTranslation("admin");

  switch (access.state) {
    case "loading":
      return <Skeleton className={className} aria-hidden="true" />;
    case "areaError":
      return <ErrorState className={className} onRetry={access.retry} isRetrying={access.isRetrying} />;
    case "noArea":
      return <ErrorState tone="neutral" className={className} title={t("dashboard.noArea")} description={t("observationFlags.access.noArea")} />;
    case "off":
      return (
        <ErrorState
          tone="neutral"
          className={className}
          title={t("observationFlags.access.offTitle")}
          description={t("observationFlags.access.off")}
        />
      );
  }
}

export function MeasurementsOffNotice() {
  const { t } = useTranslation("admin");

  return (
    <div role="status" className="flex shrink-0 flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
      <HugeiconsIcon icon={InformationCircleIcon} aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="font-semibold text-foreground">{t("observationFlags.access.offTitle")}</span> - {t("observationFlags.access.offAdmin")}
      </span>
      <SystemSettingsLink />
    </div>
  );
}
