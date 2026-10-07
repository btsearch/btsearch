import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import type { StationRecord } from "../../types";
import { getBrandColor, getOperatorBrand } from "../../utils/brands";
import { formatSectorAzimuth } from "../../utils/sectors";
import { type SectorBand, type SectorBandRow, summarizeSectorBands } from "./sectorBands";
import { AzimuthCompass } from "@/components/cellular/azimuthCompass";
import { brandsQueryOptions } from "@/features/shared/lookups";
import { RatGenerationLabel } from "@/features/shared/RatGenerationLabel";
import { cn } from "@/lib/utils";

const HEAD_CELL_CLASS = "pb-1.5 text-left font-normal";
const NARROW_COLUMN_CLASS = "w-px whitespace-nowrap pr-3";
const BAND_CHIP_CLASS = "inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-md bg-muted px-2 text-xs font-medium";

type StationSectorsTabProps = {
  station: StationRecord;
};

type SectorsCompassProps = {
  station: StationRecord;
};

type SectorBandsTableProps = {
  rows: SectorBandRow[];
};

type SectorBandChipsProps = {
  bands: SectorBand[];
};

export function StationSectorsTab({ station }: StationSectorsTabProps) {
  const { t, i18n } = useTranslation("stationDetails");
  const { rows, hasLinkedCells, unlinkedCellCount } = summarizeSectorBands(station.sectors, station.cells, i18n.language);

  if (!hasLinkedCells) {
    return (
      <section className="flex min-h-72 flex-col items-center justify-center gap-4">
        <SectorsCompass station={station} />
        <div className="flex flex-wrap items-center justify-center gap-2">
          {rows.map((sector) => (
            <span key={sector.id} className="text-xs font-medium text-muted-foreground tabular-nums">
              {sector.label}: {formatSectorAzimuth(sector.azimuth, t)}
            </span>
          ))}
        </div>
        <p className="text-center text-xs text-muted-foreground">{t("sectors.noLinkedCells")}</p>
      </section>
    );
  }

  return (
    <section className="flex min-h-72 flex-wrap items-center justify-center gap-x-12 gap-y-8">
      <SectorsCompass station={station} />
      <div className="min-w-0 grow basis-80">
        <SectorBandsTable rows={rows} />
        {unlinkedCellCount > 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">{t("sectors.unlinkedCells", { count: unlinkedCellCount })}</p>
        ) : null}
      </div>
    </section>
  );
}

function SectorsCompass({ station }: SectorsCompassProps) {
  const { t } = useTranslation("stationDetails");
  const { data: brands } = useQuery(brandsQueryOptions());

  return (
    <AzimuthCompass
      directions={station.sectors.map((sector) => ({ azimuth: sector.azimuth, name: formatSectorAzimuth(sector.azimuth, t) }))}
      color={getBrandColor(getOperatorBrand(station.operator, brands))}
      className="size-56 sm:size-60"
    />
  );
}

function SectorBandsTable({ rows }: SectorBandsTableProps) {
  const { t } = useTranslation("stationDetails");

  return (
    <table aria-label={t("tabs.sectors")} className="w-full">
      <thead>
        <tr className="border-b text-xs text-muted-foreground">
          <th scope="col" colSpan={2} className={cn(HEAD_CELL_CLASS, NARROW_COLUMN_CLASS)}>
            {t("common:labels.azimuth")}
          </th>
          <th scope="col" className={HEAD_CELL_CLASS}>
            {t("sectors.bandsOnSector")}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((sector) => (
          <tr key={sector.id} className="border-b border-border/60 last:border-b-0">
            <th scope="row" className={cn(NARROW_COLUMN_CLASS, "py-2.5 text-left text-xs font-semibold text-foreground/80 tabular-nums")}>
              {sector.label}
            </th>
            <td className={cn(NARROW_COLUMN_CLASS, "py-2.5 text-sm font-medium", sector.azimuth !== null && "font-mono")}>
              {formatSectorAzimuth(sector.azimuth, t)}
            </td>
            <td className="py-2.5">
              <SectorBandChips bands={sector.bands} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SectorBandChips({ bands }: SectorBandChipsProps) {
  const { t } = useTranslation("stations");

  if (bands.length === 0) return <span className="text-sm text-muted-foreground">-</span>;

  return (
    <ul className="flex flex-wrap gap-1">
      {bands.map((band) => (
        <li key={band.key} className={BAND_CHIP_CLASS}>
          <RatGenerationLabel rat={band.rat} />
          {band.label === null ? <span>{t("cells.unknownBand")}</span> : <span className="font-mono">{band.label}</span>}
          {band.code !== null ? <span className="font-mono text-[11px] text-muted-foreground">{band.code}</span> : null}
        </li>
      ))}
    </ul>
  );
}
