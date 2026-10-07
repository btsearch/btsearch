import type { TFunction } from "i18next";

import type { Sector } from "../types";
import { type CellIdentifierField, findCellIdentifierLabel, findCellTypeNameKey } from "../utils/cells";
import { formatSectorAzimuth } from "../utils/sectors";
import { findV1StationStatus, getLocationLabel } from "../utils/stations";
import { formatUnresolvedId, getNameById } from "./names";
import type { HistoryNames } from "./names";
import type { HistoryFieldChange, HistoryFieldName, HistoryLine, StationHistoryLocation, StationHistoryValue } from "./types";
import { isUplinkType, uplinkTypeKey } from "@/lib/format/uplink";

type FieldLabel = { translationKey: string } | { text: string };

export const MISSING_VALUE = "-";

const LIST_SEPARATOR = ", ";

const FIELD_LABELS: Record<Exclude<HistoryFieldName, CellIdentifierField>, FieldLabel> = {
  siteId: { translationKey: "common:labels.stationId" },
  status: { translationKey: "common:labels.status" },
  notes: { translationKey: "common:labels.notes" },
  operatorId: { translationKey: "common:labels.operator" },
  isConfirmed: { translationKey: "common:labels.confirmed" },
  location: { translationKey: "common:labels.location" },
  regionId: { translationKey: "common:labels.region" },
  city: { translationKey: "common:labels.city" },
  address: { translationKey: "common:labels.address" },
  longitude: { translationKey: "common:labels.longitude" },
  latitude: { translationKey: "common:labels.latitude" },
  structureType: { translationKey: "common:structure.type" },
  structureOwner: { translationKey: "common:structure.owner" },
  structureNote: { translationKey: "common:structure.note" },
  networksId: { translationKey: "common:labels.networksId" },
  networksName: { translationKey: "common:labels.networksName" },
  operatorName: { translationKey: "stationDetails:history.fields.mnoName" },
  medium: { translationKey: "common:labels.uplinkType" },
  speedMbps: { translationKey: "common:labels.uplinkSpeed" },
  model: { translationKey: "stationDetails:history.fields.uplinkModel" },
  azimuths: { translationKey: "common:labels.azimuths" },
  sector: { translationKey: "common:labels.azimuth" },
  bandId: { translationKey: "common:labels.band" },
  cellType: { translationKey: "common:labels.cellType" },
  mode: { translationKey: "common:labels.type" },
  rat: { text: "RAT" },
  gnbidLength: { text: "gNBID length" },
  uarfcn: { text: "UARFCN" },
  earfcn: { text: "EARFCN" },
  arfcn: { text: "ARFCN" },
  isEGsm: { text: "E-GSM" },
  supportsIot: { text: "IoT" },
  supportsRedCap: { text: "RedCap" },
};

const FIELD_LABELS_BY_NAME = new Map<string, FieldLabel>(Object.entries(FIELD_LABELS));

function getFieldLabel(field: string, t: TFunction): string {
  const label = FIELD_LABELS_BY_NAME.get(field);
  if (label === undefined) return findCellIdentifierLabel(field) ?? field;
  return "text" in label ? label.text : t(label.translationKey);
}

export function formatBand(bandId: number | null, names: HistoryNames, t: TFunction): string {
  return bandId === null ? t("stations:cells.unknownBand") : getNameById(names.bands, bandId);
}

function formatLocation(location: StationHistoryLocation | null): string | null {
  if (location === null) return null;
  return getLocationLabel(location) ?? formatUnresolvedId(location.id);
}

function formatSector(sector: Sector | null, t: TFunction): string | null {
  return sector === null ? null : formatSectorAzimuth(sector.azimuth, t);
}

function formatAzimuths(azimuths: readonly (number | null)[], t: TFunction): string {
  if (azimuths.length === 0) return MISSING_VALUE;
  return azimuths.map((azimuth) => formatSectorAzimuth(azimuth, t)).join(LIST_SEPARATOR);
}

function formatStatus(status: string, t: TFunction): string {
  const v1Status = findV1StationStatus(status);
  return v1Status === undefined ? status : t(`stations:status.${v1Status}`);
}

function formatCellType(cellType: string, t: TFunction): string {
  const nameKey = findCellTypeNameKey(cellType);
  return nameKey === undefined ? cellType : t(nameKey);
}

function formatText(field: string, value: string, t: TFunction): string {
  if (field === "status") return formatStatus(value, t);
  if (field === "cellType") return formatCellType(value, t);
  if (field === "structureType") return t(`common:structure.types.${value}`, { defaultValue: value });
  if (field === "medium" && isUplinkType(value)) return t(`common:labels.${uplinkTypeKey(value)}`);
  if (field === "mode" || field === "rat") return value.toUpperCase();
  return value;
}

function formatNumber(field: string, value: number, names: HistoryNames): string {
  if (field === "operatorId") return getNameById(names.operators, value);
  if (field === "regionId") return getNameById(names.regions, value);
  if (field === "structureOwner") return formatUnresolvedId(value);
  return String(value);
}

function formatValue(field: string, value: StationHistoryValue, names: HistoryNames, t: TFunction): string | null {
  if (field === "bandId" && (value === null || typeof value === "number")) return formatBand(value, names, t);
  if (value === null) return null;
  if (value === "") return MISSING_VALUE;
  if (typeof value === "boolean") return t(value ? "common:labels.yes" : "common:labels.no");
  if (typeof value === "number") return formatNumber(field, value, names);
  return formatText(field, value, t);
}

function describeFieldChange(change: HistoryFieldChange, position: number, names: HistoryNames, t: TFunction): HistoryLine {
  const key = `${change.field}-${position}`;
  const label = getFieldLabel(change.field, t);
  if (change.field === "location") return { key, label, from: formatLocation(change.from), to: formatLocation(change.to) };
  if (change.field === "sector") return { key, label, from: formatSector(change.from, t), to: formatSector(change.to, t) };
  if (change.field === "azimuths") return { key, label, from: formatAzimuths(change.from, t), to: formatAzimuths(change.to, t) };
  return { key, label, from: formatValue(change.field, change.from, names, t), to: formatValue(change.field, change.to, names, t) };
}

export function describeFieldChanges(changes: readonly HistoryFieldChange[], names: HistoryNames, t: TFunction): HistoryLine[] {
  return changes.map((change, position) => describeFieldChange(change, position, names, t));
}
