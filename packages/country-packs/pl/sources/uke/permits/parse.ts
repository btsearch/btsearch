import { normalizeStationId } from "@openbts/shared/stationId";

import type { DecisionType, LocalFile, PermitLabel, ReadContext, Release, SiteRecord } from "../../../../core/sources.ts";
import { parseDmsCoordinate } from "../shared/coordinates.ts";
import { parseExcelDay } from "../shared/dates.ts";
import { labelFromSliceKey } from "../shared/labels.ts";
import { readFirstSheet, trimmedText, untrimmedTextOrNull } from "../shared/sheets.ts";
import { regionIsoCodeFromTeryt } from "./teryt.ts";

const REQUIRED_COLUMNS = [
  "Nazwa Operatora",
  "Nr Decyzji",
  "Rodzaj decyzji",
  "Data ważności",
  "Dł geogr stacji",
  "Szer geogr stacji",
  "Miejscowość",
  "Lokalizacja",
  "IdStacji",
  "TERYT",
];

function parseDecisionType(value: unknown): DecisionType | null {
  const decisionType = value ?? "P";
  if (decisionType === "P") return "permit";
  return decisionType === "zmP" ? "permit_change" : null;
}

async function* readPermitFile(ctx: ReadContext, slice: string, label: PermitLabel, file: LocalFile): AsyncGenerator<SiteRecord> {
  const { rows } = await readFirstSheet(file, REQUIRED_COLUMNS);
  for await (const row of rows) {
    const longitude = parseDmsCoordinate(row["Dł geogr stacji"]);
    const latitude = parseDmsCoordinate(row["Szer geogr stacji"]);
    if (!longitude || !latitude) {
      ctx.skip(slice, "bad_coordinates");
      continue;
    }

    const licensee = trimmedText(row["Nazwa Operatora"]);
    if (!licensee) {
      ctx.skip(slice, "missing_licensee");
      continue;
    }

    const siteId = normalizeStationId(String(row.IdStacji || ""));
    if (!siteId) {
      ctx.skip(slice, "missing_site_id");
      continue;
    }

    const decisionType = parseDecisionType(row["Rodzaj decyzji"]);
    if (decisionType === null) {
      ctx.skip(slice, "unknown_decision_type");
      continue;
    }

    yield {
      slice,
      location: {
        longitude,
        latitude,
        city: untrimmedTextOrNull(row.Miejscowość),
        address: untrimmedTextOrNull(row.Lokalizacja),
        regionIsoCode: regionIsoCodeFromTeryt(row.TERYT),
      },
      site: { siteId, licensee, name: null },
      permit: { label, number: trimmedText(row["Nr Decyzji"]), decisionType, expiresOn: parseExcelDay(row["Data ważności"], ctx.now) },
      sectors: [],
    };
  }
}

export async function* parsePermits(ctx: ReadContext, release: Release, files: readonly LocalFile[]): AsyncIterable<SiteRecord> {
  const [slice] = release.coveredSlices;
  if (slice === undefined) throw new Error("A permits release covers one band label");

  const label = labelFromSliceKey(slice);
  for (const file of files) yield* readPermitFile(ctx, slice, label, file);
}
