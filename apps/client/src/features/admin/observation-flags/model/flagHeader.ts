import type { ObservationFlag } from "@openbts/shared/contract";
import type { CellRat } from "@openbts/shared/contract/constants";

import { type FlagTextContext, findCreatedCell, formatStationWithOperator, getRegionName } from "./flagText";
import {
  type NumberedItem,
  formatCellBand,
  formatDegrees,
  getCellIdCode,
  getNodeCode,
  getRatGeneration,
  joinParts,
  readCellId,
  readItemNumber,
} from "./format";
import { isAboutSite } from "./kinds";
import { formatDistance } from "@/lib/format";

type FlagCellLine = { generation: string; band: string; ids: string };

type NumberedCell = NumberedItem & { rat: CellRat };

const ECI_FACTOR = 256;
const LONG_CID_FACTOR = 65536;
const NCI_BITS = 36;
const NODE_FIELDS: Record<CellRat, string | null> = { gsm: null, umts: "rnc", lte: "enbid", nr: "gnbid" };
const COMPUTED_ID_LABELS: Record<CellRat, string | null> = { gsm: null, umts: "LongCID", lte: "ECI", nr: "NCI" };

function getStationPlace(flag: ObservationFlag, region: string): string {
  const location = flag.station?.location ?? null;
  const street = joinParts([location?.city ?? null, location?.address ?? null]);
  return [street, region].filter((part) => part !== "").join(", ");
}

export function getFlagPlace(flag: ObservationFlag, groupNames: readonly string[], ctx: FlagTextContext): string {
  const { t, language } = ctx;
  const region = getRegionName(flag, ctx.lookups);
  switch (flag.kind) {
    case "readerQuirk":
      return t(flag.evidence.deviceModel === null ? "observationFlags.places.allPhones" : "observationFlags.places.allReaders");
    case "untrustedContributor":
      return t("observationFlags.subjects.contributor");
    case "deviceRevoked":
      return t("observationFlags.places.device");
    case "bandNotInPlan":
      return t("observationFlags.places.bandPlan");
    case "gnbLengthSuggestion":
      return t("observationFlags.places.network");
    case "suggestedSite":
      return joinParts([
        region,
        t("observationFlags.places.fromStation", {
          distance: formatDistance(flag.evidence.distanceMeters, language),
          station: formatStationWithOperator(flag, ctx.lookups),
        }),
      ]);
    default:
      if (!isAboutSite(flag)) return getStationPlace(flag, region);
      return joinParts([region, groupNames.length === 0 ? null : t("observationFlags.places.group", { names: groupNames.join(", ") })]);
  }
}

function computeId(cell: NumberedCell, node: number | null, cellId: number | null): number | null {
  if (node === null || node === 0 || cellId === null) return null;
  if (cell.rat === "lte") return node * ECI_FACTOR + cellId;
  if (cell.rat === "umts") return node * LONG_CID_FACTOR + cellId;
  const length = readItemNumber(cell, "gnbidLength");
  return cell.rat === "nr" && length !== null ? node * 2 ** (NCI_BITS - length) + cellId : null;
}

function labelled(label: string | null, value: number | null): string | null {
  return label === null || value === null ? null : `${label} ${value}`;
}

function describeCellIds(cell: NumberedCell, sectorAzimuth: number | null, ctx: FlagTextContext): string {
  const { rat } = cell;
  const nodeField = NODE_FIELDS[rat];
  const node = nodeField === null ? null : readItemNumber(cell, nodeField);
  const cellId = readCellId(cell);
  return joinParts([
    rat === "gsm" ? labelled("LAC", readItemNumber(cell, "lac")) : null,
    labelled(getNodeCode(rat), node),
    labelled(getCellIdCode(rat), cellId),
    labelled(COMPUTED_ID_LABELS[rat], computeId(cell, node, cellId)),
    sectorAzimuth === null ? null : ctx.t("observationFlags.cellLine.sector", { azimuth: formatDegrees(sectorAzimuth) }),
  ]);
}

export function getFlagCellLine(flag: ObservationFlag, ctx: FlagTextContext): FlagCellLine | null {
  if (isAboutSite(flag) || flag.kind === "readerQuirk" || flag.kind === "bandNotInPlan") return null;
  const createdCell = flag.kind === "cellMissing" ? findCreatedCell(flag) : null;
  const cell = flag.cell ?? createdCell ?? flag.observedCell ?? null;
  if (cell === null) return null;
  return {
    generation: getRatGeneration(cell.rat),
    band: formatCellBand(cell, ctx.lookups, ctx.language),
    ids: describeCellIds(cell, flag.kind === "bearingDiffers" ? flag.evidence.azimuth : null, ctx),
  };
}
