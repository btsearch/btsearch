import { Add01Icon, ArrowDown01Icon, Cancel01Icon, DragDropVerticalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ChangeEvent, type ReactNode, memo, useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { AzimuthDiagram } from "@/features/station-details/components/sectorMiniCompass";
import { SI2PEMLogo } from "@/features/station-details/components/si2pemLogo";
import { UKELogo } from "@/features/station-details/components/ukeLogo";
import { cn } from "@/lib/utils";
import type { SectorDraft } from "@/types/station";

const MAX_SECTORS = 15;
const OMNIDIRECTIONAL_AZIMUTH = 360;

type SectorRowProps = {
  sector: SectorDraft;
  index: number;
  onAzimuthChange: (localId: string, value: number | "") => void;
  onDelete: (localId: string) => void;
  readOnly?: boolean;
  deleteDisabled?: boolean;
  previousAzimuth?: number;
  renderPreviousAzimuth?: (azimuth: number) => ReactNode;
};

const SectorRow = memo(function SectorRow({
  sector,
  index,
  onAzimuthChange,
  onDelete,
  readOnly,
  deleteDisabled,
  previousAzimuth,
  renderPreviousAzimuth,
}: SectorRowProps) {
  const handleAzimuthChange = useCallback(
    (el: ChangeEvent<HTMLInputElement>) => {
      const raw = el.target.value;
      if (raw === "") {
        onAzimuthChange(sector._localId, "");
        return;
      }
      const azimuth = Number.parseInt(raw, 10);
      if (!Number.isNaN(azimuth) && azimuth >= 0 && azimuth <= OMNIDIRECTIONAL_AZIMUTH) onAzimuthChange(sector._localId, azimuth);
    },
    [sector._localId, onAzimuthChange],
  );

  const handleDelete = useCallback(() => onDelete(sector._localId), [sector._localId, onDelete]);

  return (
    <div className="flex items-center gap-2 py-1.5">
      {!readOnly ? <HugeiconsIcon icon={DragDropVerticalIcon} className="size-4 text-muted-foreground/50 cursor-grab shrink-0" /> : null}
      <span className="w-7 text-sm font-medium tabular-nums">A{index + 1}</span>
      <div className="space-y-1">
        <Input
          type="number"
          min={0}
          max={OMNIDIRECTIONAL_AZIMUTH}
          value={sector.azimuth}
          onChange={handleAzimuthChange}
          disabled={readOnly}
          className="w-20 h-7 text-sm tabular-nums"
          placeholder="0-360"
        />
        {previousAzimuth !== undefined && previousAzimuth !== sector.azimuth ? (renderPreviousAzimuth?.(previousAzimuth) ?? null) : null}
      </div>
      <span className="text-xs text-muted-foreground">°</span>
      {!readOnly ? (
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-destructive shrink-0"
          onClick={handleDelete}
          type="button"
          disabled={deleteDisabled}
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
        </Button>
      ) : null}
    </div>
  );
});

function SectorCompass({ sectors }: { sectors: SectorDraft[] }) {
  const validSectors = sectors.flatMap((sector) => (typeof sector.azimuth === "number" ? [{ azimuth: sector.azimuth }] : []));

  return <AzimuthDiagram sectors={validSectors} className="mx-auto size-32" />;
}

type SectorsEditorProps = {
  sectors: SectorDraft[];
  onChange: (sectors: SectorDraft[]) => void;
  derivedSectorCount: number;
  readOnly?: boolean;
  assignedSectorLocalIds?: ReadonlySet<string>;
  previousAzimuthByLocalId?: ReadonlyMap<string, number>;
  renderPreviousAzimuth?: (azimuth: number) => ReactNode;
};

let _sectorIdCounter = 0;
function newSectorLocalId() {
  return `sector-draft-${++_sectorIdCounter}`;
}

export function SectorsEditor({
  sectors,
  onChange,
  derivedSectorCount,
  readOnly,
  assignedSectorLocalIds,
  previousAzimuthByLocalId,
  renderPreviousAzimuth,
}: SectorsEditorProps) {
  const { t } = useTranslation(["stationDetails", "submissions"]);

  const handleAzimuthChange = useCallback(
    (localId: string, value: number | "") => {
      onChange(sectors.map((sector) => (sector._localId === localId ? { ...sector, azimuth: value } : sector)));
    },
    [sectors, onChange],
  );

  const handleDelete = useCallback(
    (localId: string) => {
      if (assignedSectorLocalIds?.has(localId)) return;
      onChange(sectors.filter((sector) => sector._localId !== localId));
    },
    [assignedSectorLocalIds, sectors, onChange],
  );

  const handleAdd = useCallback(() => {
    if (sectors.length >= MAX_SECTORS) return;
    onChange([...sectors, { _localId: newSectorLocalId(), azimuth: "" }]);
  }, [sectors, onChange]);

  return (
    <div className="space-y-4">
      {derivedSectorCount > 0 ? (
        <div className="mx-4 rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          {t("sectors.suggestedCount")} <span className="font-semibold tabular-nums text-foreground">{derivedSectorCount}</span>
        </div>
      ) : null}

      <div className={cn("grid gap-4 px-4", sectors.length > 0 && "sm:grid-cols-[auto_1fr]")}>
        {sectors.length > 0 ? <SectorCompass sectors={sectors} /> : null}
        <div className="space-y-0.5">
          {sectors.length > 0 ? (
            <>
              <div className="px-1 pb-1 text-xs text-muted-foreground">{t("sectors.azimuth")}</div>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-x-4 gap-y-0.5">
                {sectors.map((sector, i) => (
                  <SectorRow
                    key={sector._localId}
                    sector={sector}
                    index={i}
                    onAzimuthChange={handleAzimuthChange}
                    onDelete={handleDelete}
                    readOnly={readOnly}
                    deleteDisabled={assignedSectorLocalIds?.has(sector._localId)}
                    previousAzimuth={previousAzimuthByLocalId?.get(sector._localId)}
                    renderPreviousAzimuth={renderPreviousAzimuth}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="flex min-h-24 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
              {t("sectors.empty")}
            </div>
          )}
        </div>
      </div>

      {!readOnly ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mx-4 mb-4 h-8 text-xs"
          onClick={handleAdd}
          disabled={sectors.length >= MAX_SECTORS}
        >
          <HugeiconsIcon icon={Add01Icon} className="size-3.5 mr-1.5" />
          {t("sectors.add")}
          <span className="ml-auto text-muted-foreground tabular-nums">
            {sectors.length}/{MAX_SECTORS}
          </span>
        </Button>
      ) : null}
    </div>
  );
}

type SectorsPanelProps = SectorsEditorProps & {
  className?: string;
  defaultOpen?: boolean;
  siblingSectors?: {
    brand: string;
    icon: ReactNode;
    onFetch: () => Promise<Array<{ azimuth: number }>>;
  };
  ukeSectors?: {
    onFetch: () => Promise<Array<{ azimuth: number }>>;
  };
  azimuthSources?: {
    si2pem?: {
      onFetch: () => Promise<Array<{ azimuth: number }>>;
    };
    uke?: {
      onFetch: () => Promise<Array<{ azimuth: number }>>;
    };
  };
};

type AzimuthSource = "si2pem" | "uke";

function applyFetchedAzimuths(sectors: SectorDraft[], fetchedSectors: Array<{ azimuth: number }>): SectorDraft[] {
  const copyCount = Math.min(fetchedSectors.length, MAX_SECTORS);
  const next = [...sectors];

  for (let i = 0; i < copyCount; i++) {
    const sector = next[i];
    const azimuth = fetchedSectors[i].azimuth;
    next[i] = sector ? { ...sector, azimuth } : { _localId: newSectorLocalId(), azimuth };
  }

  return next;
}

export function ukePermitsToAzimuthSectors(permits: Array<{ sectors?: Array<{ azimuth: number | null }> }>): Array<{ azimuth: number }> {
  const seen = new Set<number>();
  const sectors: Array<{ azimuth: number }> = [];

  for (const permit of permits) {
    for (const sector of permit.sectors ?? []) {
      if (sector.azimuth === null || seen.has(sector.azimuth)) continue;
      seen.add(sector.azimuth);
      sectors.push({ azimuth: sector.azimuth });
    }
  }

  return sectors;
}

export function SectorsPanel({
  className,
  defaultOpen,
  sectors,
  derivedSectorCount,
  siblingSectors,
  ukeSectors,
  azimuthSources,
  onChange,
  readOnly,
  ...editorProps
}: SectorsPanelProps) {
  const { t } = useTranslation(["stationDetails", "submissions"]);
  const [isFetchingSiblingSectors, setIsFetchingSiblingSectors] = useState(false);
  const [isFetchingUkeSectors, setIsFetchingUkeSectors] = useState(false);
  const [fetchingAzimuthSource, setFetchingAzimuthSource] = useState<AzimuthSource | null>(null);
  const [isOpen, setIsOpen] = useState(() => defaultOpen ?? false);
  const mountedEmptyRef = useRef(sectors.length === 0);
  const hasAzimuthSources = azimuthSources?.si2pem !== undefined || azimuthSources?.uke !== undefined;

  const handleSectorsChange = useCallback(
    (nextSectors: SectorDraft[]) => {
      if (mountedEmptyRef.current && sectors.length === 0 && nextSectors.length > 0) setIsOpen(true);
      onChange(nextSectors);
    },
    [onChange, sectors.length],
  );

  const handleFetchSiblingSectors = useCallback(async () => {
    if (!siblingSectors || readOnly) return;
    setIsFetchingSiblingSectors(true);
    try {
      const fetchedSectors = await siblingSectors.onFetch();
      if (fetchedSectors.length === 0) {
        toast.info(t("siblingSectors.notFound", { ns: "submissions" }));
        return;
      }
      handleSectorsChange(applyFetchedAzimuths(sectors, fetchedSectors));
      toast.success(t("siblingSectors.fetched", { ns: "submissions" }));
    } catch {
      toast.error(t("siblingSectors.fetchFailed", { ns: "submissions" }));
    } finally {
      setIsFetchingSiblingSectors(false);
    }
  }, [handleSectorsChange, readOnly, sectors, siblingSectors, t]);

  const handleFetchUkeSectors = useCallback(async () => {
    if (!ukeSectors || readOnly) return;
    setIsFetchingUkeSectors(true);
    try {
      const fetchedSectors = await ukeSectors.onFetch();
      if (fetchedSectors.length === 0) {
        toast.info(t("ukeSectors.notFound", { ns: "submissions" }));
        return;
      }
      handleSectorsChange(applyFetchedAzimuths(sectors, fetchedSectors));
      toast.success(t("ukeSectors.fetched", { ns: "submissions" }));
    } catch {
      toast.error(t("ukeSectors.fetchFailed", { ns: "submissions" }));
    } finally {
      setIsFetchingUkeSectors(false);
    }
  }, [handleSectorsChange, readOnly, sectors, t, ukeSectors]);

  const handleFetchAzimuths = useCallback(
    async (source: AzimuthSource) => {
      const sourceConfig = azimuthSources?.[source];
      if (!sourceConfig || readOnly) return;
      setFetchingAzimuthSource(source);
      const messages =
        source === "si2pem"
          ? {
              notFound: t("azimuthFetch.si2pem.notFound", { ns: "submissions" }),
              fetched: t("azimuthFetch.si2pem.fetched", { ns: "submissions" }),
              fetchFailed: t("azimuthFetch.si2pem.fetchFailed", { ns: "submissions" }),
            }
          : {
              notFound: t("azimuthFetch.uke.notFound", { ns: "submissions" }),
              fetched: t("azimuthFetch.uke.fetched", { ns: "submissions" }),
              fetchFailed: t("azimuthFetch.uke.fetchFailed", { ns: "submissions" }),
            };
      try {
        const fetchedSectors = await sourceConfig.onFetch();
        if (fetchedSectors.length === 0) {
          toast.info(messages.notFound);
          return;
        }
        handleSectorsChange(applyFetchedAzimuths(sectors, fetchedSectors));
        toast.success(messages.fetched);
      } catch {
        toast.error(messages.fetchFailed);
      } finally {
        setFetchingAzimuthSource(null);
      }
    },
    [azimuthSources, handleSectorsChange, readOnly, sectors, t],
  );

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className={cn("border rounded-xl overflow-hidden", className)}>
        <div className="px-4 py-2.5 bg-muted/50 border-b flex items-center justify-between">
          <CollapsibleTrigger className="flex items-center gap-2 cursor-pointer select-none group">
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              className="size-3.5 text-muted-foreground transition-transform group-data-panel-open:rotate-0 -rotate-90"
            />
            <span className="font-semibold text-sm">{t("tabs.sectors")}</span>
          </CollapsibleTrigger>
          <div className="flex items-center gap-2">
            {!readOnly && hasAzimuthSources ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button type="button" variant="outline" size="sm" disabled={fetchingAzimuthSource !== null} className="h-7 gap-1.5 text-xs" />
                  }
                >
                  {fetchingAzimuthSource !== null
                    ? t("azimuthFetch.fetching", { ns: "submissions" })
                    : t("azimuthFetch.fetch", { ns: "submissions" })}
                  <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {azimuthSources?.si2pem ? (
                    <DropdownMenuItem onClick={() => void handleFetchAzimuths("si2pem")}>
                      <SI2PEMLogo className="h-3" />
                      SI2PEM
                    </DropdownMenuItem>
                  ) : null}
                  {azimuthSources?.uke ? (
                    <DropdownMenuItem onClick={() => void handleFetchAzimuths("uke")}>
                      <UKELogo className="size-auto h-3.5 w-7" />
                      UKE
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {!readOnly && ukeSectors ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleFetchUkeSectors}
                disabled={isFetchingUkeSectors}
                className="h-7 text-xs"
              >
                {isFetchingUkeSectors ? t("ukeSectors.fetching", { ns: "submissions" }) : t("ukeSectors.fetch", { ns: "submissions" })}
              </Button>
            ) : null}
            {!readOnly && siblingSectors ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleFetchSiblingSectors}
                disabled={isFetchingSiblingSectors}
                className="h-7 gap-1.5 text-xs"
              >
                {siblingSectors.icon}
                {isFetchingSiblingSectors
                  ? t("siblingSectors.fetching", { ns: "submissions" })
                  : t("siblingSectors.fetchFrom", { ns: "submissions", brand: siblingSectors.brand })}
              </Button>
            ) : null}
            <span className="text-xs text-muted-foreground">
              {sectors.length}/{MAX_SECTORS}
            </span>
          </div>
        </div>
        <CollapsibleContent className="pt-2">
          <SectorsEditor
            sectors={sectors}
            onChange={handleSectorsChange}
            derivedSectorCount={derivedSectorCount}
            readOnly={readOnly}
            {...editorProps}
          />
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
