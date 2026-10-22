import { Building06Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { OfficialSitePermit } from "@openbts/shared/contract";
import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { type AntennaBand, type PermitDirection, listPermitDirections } from "../officialPermits";
import { formatSectorAzimuth } from "../station/utils/sectors";
import { OfficialBandLabel } from "./officialBandLabel";
import { AzimuthCompass, AzimuthCompassMark } from "@/components/cellular/azimuthCompass";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PermitDirectionsProps = {
  permits: readonly OfficialSitePermit[];
  color: string | null;
};

type DirectionBlockProps = {
  direction: PermitDirection;
  color: string | null;
  isSelected: boolean;
  onToggle: () => void;
};

const dashedOutlineClassName = "border border-dashed border-muted-foreground";

function hasBandNotInService(directions: readonly PermitDirection[]): boolean {
  return directions.some((direction) => direction.antennas.some((antenna) => antenna.bands.some((band) => !band.isInService)));
}

export function PermitDirections({ permits, color }: PermitDirectionsProps) {
  const { t } = useTranslation("stationDetails");
  const titleId = useId();
  const directions = useMemo(() => listPermitDirections(permits), [permits]);
  const [pickedAzimuth, setPickedAzimuth] = useState<number | null | undefined>(undefined);
  if (directions.length === 0) return null;

  const selectedAzimuth = directions.some((direction) => direction.azimuth === pickedAzimuth) ? pickedAzimuth : undefined;
  const shownDirections = selectedAzimuth === undefined ? directions : directions.filter((direction) => direction.azimuth === selectedAzimuth);
  const hasBandsWithoutAzimuth = permits.some((permit) => (permit.sectors ?? []).length === 0);
  const compassDirections = directions.map((direction) => ({
    azimuth: direction.azimuth,
    name: formatSectorAzimuth(direction.azimuth, t),
    isIndoor: direction.isIndoor,
  }));

  return (
    <section aria-labelledby={titleId} className="@container space-y-3">
      <div className="flex min-h-6 items-center gap-3">
        <h3 id={titleId} className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          {t("tabs.sectors")}
        </h3>
        <span className="text-xs text-muted-foreground">{t("permits.directionsCount", { count: directions.length })}</span>
        {selectedAzimuth === undefined ? null : (
          <Button variant="ghost" size="xs" className="ml-auto" onClick={() => setPickedAzimuth(undefined)}>
            {t("permits.allDirections")}
          </Button>
        )}
      </div>
      <div className="flex flex-col items-center gap-4 @xl:flex-row @xl:items-start @xl:gap-8">
        <AzimuthCompass
          directions={compassDirections}
          color={color}
          selectedAzimuth={selectedAzimuth}
          onSelectedAzimuthChange={setPickedAzimuth}
          className="size-56"
        />
        <div className="w-full min-w-0 flex-1 space-y-3">
          {shownDirections.map((direction) => (
            <DirectionBlock
              key={direction.azimuth ?? "omnidirectional"}
              direction={direction}
              color={color}
              isSelected={direction.azimuth === selectedAzimuth}
              onToggle={() => setPickedAzimuth(direction.azimuth === selectedAzimuth ? undefined : direction.azimuth)}
            />
          ))}
          {hasBandNotInService(directions) ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <span aria-hidden="true" className={cn("h-4 w-6 shrink-0 rounded", dashedOutlineClassName)} />
              {t("permits.dashedMeansNotInService")}
            </p>
          ) : null}
          {hasBandsWithoutAzimuth ? <p className="text-xs text-muted-foreground">{t("permits.bandsWithoutAzimuth")}</p> : null}
        </div>
      </div>
    </section>
  );
}

function DirectionBlock({ direction, color, isSelected, onToggle }: DirectionBlockProps) {
  const { t } = useTranslation("stationDetails");

  return (
    <div className="overflow-hidden rounded-xl border">
      <button
        type="button"
        aria-pressed={isSelected}
        onClick={onToggle}
        className="flex w-full cursor-pointer items-center gap-2 border-b bg-muted/30 px-3 py-2 text-left transition-colors hover:bg-muted/60"
      >
        <AzimuthCompassMark azimuth={direction.azimuth} color={color} />
        <span className="text-sm font-bold tabular-nums">{formatSectorAzimuth(direction.azimuth, t)}</span>
        {direction.isIndoor ? (
          <span className={cn("inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold", dashedOutlineClassName)}>
            <HugeiconsIcon icon={Building06Icon} className="size-3" aria-hidden="true" />
            {t("permits.indoor")}
          </span>
        ) : null}
      </button>
      <ul className="divide-y divide-border/60">
        {direction.antennas.map((antenna) => (
          <li key={antenna.heightMeters ?? "unknown"} className="flex items-start gap-3 px-3 py-2.5">
            <AntennaHeight heightMeters={antenna.heightMeters} />
            <div className="flex flex-wrap gap-1.5">
              {antenna.bands.map((band) => (
                <BandChip key={band.key} band={band} />
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AntennaHeight({ heightMeters }: { heightMeters: number | null }) {
  const { t } = useTranslation("stationDetails");

  return (
    <div className="flex min-w-14 shrink-0 flex-col gap-0.5 pt-0.5">
      <span className="font-mono text-[13px] font-semibold">
        {heightMeters === null ? "-" : t("permits.antennaHeight", { meters: heightMeters })}
      </span>
      {heightMeters !== null && heightMeters < 0 ? <span className="text-xs text-muted-foreground">{t("permits.underground")}</span> : null}
    </div>
  );
}

function BandChip({ band }: { band: AntennaBand }) {
  const { t } = useTranslation("stationDetails");

  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-xs font-semibold whitespace-nowrap",
        band.isInService ? "border border-transparent bg-muted" : dashedOutlineClassName,
      )}
    >
      <OfficialBandLabel label={band.label} />
      {band.isInService ? null : <span className="sr-only">{t("permits.notInService")}</span>}
    </span>
  );
}
