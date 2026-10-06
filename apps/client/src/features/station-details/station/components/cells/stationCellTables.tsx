import { SignalFull02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import type { StationRecord } from "../../types";
import { listCellTables } from "../../utils/cells";
import { indexSectorInfo } from "../../utils/sectors";
import { CellTableCard } from "./cellTableCard";

type StationCellTablesProps = {
  station: StationRecord;
  showHeading?: boolean;
};

export function StationCellTables({ station, showHeading = true }: StationCellTablesProps) {
  const { t } = useTranslation("stationDetails");
  const sectorsById = indexSectorInfo(station.sectors);
  const tables = listCellTables(station.cells, sectorsById);

  return (
    <section>
      {showHeading ? <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t("specs.cellDetails")}</h3> : null}
      {tables.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
          <HugeiconsIcon icon={SignalFull02Icon} className="size-8 mb-2 opacity-20" aria-hidden="true" />
          <p className="text-sm">{t("stations:cells.noStationCells")}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {tables.map((table) => (
            <CellTableCard key={`${station.id}:${table.rat}`} table={table} sectorsById={sectorsById} />
          ))}
        </div>
      )}
    </section>
  );
}
