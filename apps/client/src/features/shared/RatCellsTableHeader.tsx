import type { TFunction } from "i18next";

import { getRatSectorColumnIndex, getRatShowsBandDuplex } from "./rat";
import { getRatDetailFields } from "./ratCellFields";

type RatCellsTableHeaderProps = {
  rat: string;
  t: TFunction;
  showSectors?: boolean;
  showConfirmed?: boolean;
};

export function getRatCellsTableHeaders(rat: string, t: TFunction, options?: { showConfirmed?: boolean }): string[] {
  const showConfirmed = options?.showConfirmed ?? true;
  const detailHeaders = getRatDetailFields(rat).map((field) => (field.key === "type" ? t("common:labels.type") : field.label));
  if (detailHeaders.length === 0) return [];

  const headers = [t("common:labels.band")];
  if (getRatShowsBandDuplex(rat)) headers.push("Duplex");
  headers.push(...detailHeaders, t("stations:cells.cellType"), t("common:labels.notes"));
  if (showConfirmed) headers.push(t("common:labels.confirmed"));
  headers.push("");
  return headers;
}

export function RatCellsTableHeader({ rat, t, showSectors, showConfirmed }: RatCellsTableHeaderProps) {
  const headers = getRatCellsTableHeaders(rat, t, { showConfirmed });
  const sectorHeaderIndex = getRatSectorColumnIndex(rat);
  const displayedHeaders = showSectors ? [...headers.slice(0, sectorHeaderIndex), "AZ", ...headers.slice(sectorHeaderIndex)] : headers;

  return (
    <thead>
      <tr className="border-b bg-muted/30">
        {displayedHeaders.map((header) => (
          <th key={header} className="px-4 py-2 text-left font-medium text-muted-foreground text-xs whitespace-nowrap">
            {header}
          </th>
        ))}
      </tr>
    </thead>
  );
}
