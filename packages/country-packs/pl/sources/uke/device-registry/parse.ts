import { normalizeStationId } from "@openbts/shared/stationId";

import type { AntennaPlacement, LocalFile, ReadContext, Release, SiteRecord } from "../../../../core/sources.ts";
import { parseCompactCoordinate } from "../shared/coordinates.ts";
import { parseSystemTypeLabel } from "../shared/labels.ts";
import { missingColumnsError } from "../shared/sheets.ts";
import { cellText, readSheetRows } from "../shared/workbook.ts";
import { REQUIRED_REGISTRY_HEADERS, type RegistryColumns, findRegistryColumns } from "./columns.ts";

const REGISTRY_SHEET_POSITION = 1;

function optionalCell(cells: readonly string[], index: number | undefined): string | undefined {
  return index === undefined ? undefined : cells[index];
}

function parseNumber(cell: string | undefined, { whenEmpty }: { whenEmpty: number | null }): number | null {
  if (cell === "") return whenEmpty;

  const number = Number(cell);
  return Number.isFinite(number) ? number : null;
}

function parseAntennaPlacement(cell: string | undefined): AntennaPlacement | null {
  const cellType = cell?.trim().toLowerCase();
  if (cellType === "w") return "indoor";
  return cellType === "z" ? "outdoor" : null;
}

function joinAddress(cells: readonly string[], columns: RegistryColumns): string | null {
  const parts = [columns.street, columns.houseNumber, columns.locationDescription].flatMap((index) => {
    const part = optionalCell(cells, index);
    return part ? [part.trim()] : [];
  });

  return parts.length > 0 ? parts.join(" ") : null;
}

function readRegistryLine(ctx: ReadContext, operatorKey: string, columns: RegistryColumns, cells: readonly string[]): SiteRecord | null {
  const longitude = parseCompactCoordinate(cells[columns.longitude], "E");
  const latitude = parseCompactCoordinate(cells[columns.latitude], "N");
  if (!longitude || !latitude) {
    ctx.skip(operatorKey, "bad_coordinates");
    return null;
  }

  const siteId = normalizeStationId(cells[columns.stationId] ?? "");
  if (!siteId) {
    ctx.skip(operatorKey, "missing_site_id");
    return null;
  }

  const label = parseSystemTypeLabel(cells[columns.systemType]);
  if (!label) {
    ctx.skip(operatorKey, "unknown_label");
    return null;
  }

  const applicationType = optionalCell(cells, columns.applicationType)?.trim().toUpperCase();

  return {
    slice: operatorKey,
    location: {
      longitude,
      latitude,
      city: optionalCell(cells, columns.city)?.trim() ?? null,
      address: joinAddress(cells, columns),
      regionIsoCode: null,
    },
    site: { siteId, licensee: operatorKey, name: optionalCell(cells, columns.stationName)?.trim() || null },
    permit: {
      label,
      number: (cells[columns.alternativeNumber] ?? "").trim(),
      decisionType: applicationType === "M" ? "permit_change" : "permit",
      expiresOn: null,
      status: null,
    },
    sectors: [
      {
        azimuth: parseNumber(optionalCell(cells, columns.azimuth), { whenEmpty: null }),
        antennaHeight: parseNumber(optionalCell(cells, columns.antennaHeight), { whenEmpty: 0 }),
        antennaPlacement: parseAntennaPlacement(optionalCell(cells, columns.cellType)),
      },
    ],
  };
}

async function* readRegistryFile(ctx: ReadContext, operatorKey: string, file: LocalFile): AsyncGenerator<SiteRecord> {
  const width = { lastColumn: Number.POSITIVE_INFINITY };
  let columns: RegistryColumns | null = null;

  for await (const row of readSheetRows(file, REGISTRY_SHEET_POSITION, width)) {
    const cells = row.map(cellText);
    if (columns === null) {
      columns = findRegistryColumns(file, cells);
      width.lastColumn = Math.max(...Object.values(columns).filter((index) => index !== undefined));
      continue;
    }
    if (cells.every((cell) => cell.trim() === "")) continue;

    const record = readRegistryLine(ctx, operatorKey, columns, cells);
    if (record) yield record;
  }

  if (columns === null) throw missingColumnsError(file, REQUIRED_REGISTRY_HEADERS);
}

export async function* parseDeviceRegistry(ctx: ReadContext, release: Release, files: readonly LocalFile[]): AsyncIterable<SiteRecord> {
  const [operatorKey] = release.coveredSlices;
  if (operatorKey === undefined) throw new Error("A device registry release covers one operator");

  for (const file of files) yield* readRegistryFile(ctx, operatorKey, file);
}
