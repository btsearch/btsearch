import type { CellApplyChange, ObservationFlag } from "@openbts/shared/contract";
import type { TFunction } from "i18next";

import { type FlagTextContext, formatBlockFields, formatDeviceModel, formatReaderVersion, getStationSubject } from "../model/flagText";
import { formatNetwork, getCellIdCode } from "../model/format";
import type { FlagOfKind } from "../model/kinds";
import type { ChangeNote } from "./cellChangeTable";

export type ApplyCopy = { title: string; description: string; confirm: string };

export function getApplyLabel(flag: ObservationFlag, itemCount: number, t: TFunction): string {
  switch (flag.kind) {
    case "cellMissing":
      return t("observationFlags.apply.label.addCell");
    case "suggestedSite":
      return t("observationFlags.apply.label.addCells", { station: getStationSubject(flag).text });
    case "siteIdKnown":
      return t("observationFlags.apply.siteId.confirm");
    case "bandNotInPlan":
      return t("observationFlags.apply.label.addBand");
    case "readerQuirk":
      return t("observationFlags.apply.readingBlock.confirm");
    default:
      return t("observationFlags.apply.label.change", { count: itemCount });
  }
}

export function getEditLabel(flag: ObservationFlag, t: TFunction): string {
  switch (flag.kind) {
    case "positionDiffers":
    case "bearingDiffers":
      return t("observationFlags.actions.fixInEditor");
    case "possiblyDecommissioned":
      return t("observationFlags.actions.openInEditor");
    case "untrustedContributor":
      return t("observationFlags.actions.openContributor");
    default:
      return t("observationFlags.actions.editStation");
  }
}

export function getCellsApplyCopy(cellCount: number, flagCount: number, station: string, t: TFunction): ApplyCopy {
  let closes = t("observationFlags.apply.cells.closesFlags");
  if (flagCount === 1) closes = cellCount === 1 ? t("observationFlags.apply.cells.closesOne") : t("observationFlags.apply.cells.closesCells");
  return {
    title: t("observationFlags.apply.cells.title"),
    description: `${t("observationFlags.apply.cells.changes", { count: cellCount, station })}. ${closes}`,
    confirm: t("observationFlags.apply.cells.confirm"),
  };
}

export function listCellNotes(flag: ObservationFlag, items: readonly CellApplyChange[], ctx: FlagTextContext): ChangeNote[] {
  const { t } = ctx;
  const newItems = items.filter((item) => item.action === "create");
  const [firstNewItem] = newItems;
  const notes: ChangeNote[] = [];
  if (flag.kind === "suggestedSite" && newItems.length > 0) {
    notes.push({ tone: "added", text: t("observationFlags.notes.siteCells", { count: newItems.length, station: getStationSubject(flag).text }) });
  } else if (firstNewItem !== undefined) {
    notes.push({ tone: "added", text: t("observationFlags.notes.newCell", { code: getCellIdCode(firstNewItem.rat) }) });
  }
  if (flag.kind === "networkMissing") {
    notes.push({ tone: "added", text: t("observationFlags.notes.addNetwork", { network: formatNetwork(flag.evidence.network, ctx.lookups) }) });
  }
  if (flag.kind === "networkNotSeen") {
    notes.push({ tone: "muted", text: t("observationFlags.notes.removeNetwork", { network: formatNetwork(flag.evidence.network, ctx.lookups) }) });
  }
  if (newItems.some((item) => item.sectorId === undefined || item.sectorId === null)) {
    notes.push({ tone: "muted", text: t("observationFlags.notes.sector") });
  }
  return notes;
}

export function describeReadingBlock(flag: FlagOfKind<"readerQuirk">, t: TFunction): string {
  const block = flag.suggestion?.readingBlock;
  const { deviceModel, readerVersion } = flag.evidence;
  const phones =
    deviceModel === null
      ? t("observationFlags.apply.readingBlock.reader", { reader: formatReaderVersion(readerVersion) })
      : t("observationFlags.apply.readingBlock.phones", { device: formatDeviceModel(deviceModel) });
  const mode = block?.mode === "corroborate" ? "corroborate" : "drop";
  return t(`observationFlags.apply.readingBlock.${mode}`, { fields: formatBlockFields(block?.fields ?? []), phones });
}
