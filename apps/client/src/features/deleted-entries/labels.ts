import type { TFunction } from "i18next";

import type { DeletedEntry, DeletedEntrySourceFilter } from "./types";
import { formatFullDate } from "@/lib/format";

export type DeletedEntryOperator = { name: string; mnc: number | null };
export type DeletedEntryIdentifierParts = { label: string | null; detail: string | null };

function readString(data: Record<string, unknown>, key: string): string | null {
  const value = data[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export function getDeletedEntrySourceLabel(t: TFunction, source: string): string {
  if (source === "permits") return t("permits.sourcePermits", { ns: "stationDetails" });
  if (source === "device_registry") return t("permits.sourceDeviceRegistry", { ns: "stationDetails" });
  if (source === "radiolines") return t("permits.sourceRadiolines", { ns: "stationDetails" });
  return source;
}

export function getDeletedEntrySourceFilterLabel(t: TFunction, source: DeletedEntrySourceFilter): string {
  return source === "all" ? t("status.all", { ns: "common" }) : getDeletedEntrySourceLabel(t, source);
}

export function getDeletedEntryIdentifier(entry: DeletedEntry): DeletedEntryIdentifierParts {
  if (entry.source_type === "radiolines") return { label: readString(entry.data, "permit_number"), detail: null };
  const stationId = readString(entry.data, "station_id");
  const decisionNumber = readString(entry.data, "decision_number");
  if (stationId === null) return { label: decisionNumber, detail: null };
  return { label: stationId, detail: decisionNumber === stationId ? null : decisionNumber };
}

export function getDeletedEntryOperator(entry: DeletedEntry): DeletedEntryOperator | null {
  const operator = entry.data.operator;
  if (typeof operator !== "object" || operator === null || !("name" in operator) || typeof operator.name !== "string") return null;
  return { name: operator.name, mnc: "mnc" in operator && typeof operator.mnc === "number" ? operator.mnc : null };
}

export function getDeletedEntryCreatedAt(entry: DeletedEntry): string | null {
  const createdAt = readString(entry.data, "createdAt");
  return createdAt !== null && !Number.isNaN(Date.parse(createdAt)) ? createdAt : null;
}

export function getDeletedEntryAriaLabel(t: TFunction, entry: DeletedEntry, locale: string): string {
  return [
    getDeletedEntryOperator(entry)?.name,
    getDeletedEntryIdentifier(entry).label,
    getDeletedEntrySourceLabel(t, entry.source_type),
    `${t("deletedEntries.columns.deletedAt", { ns: "deletedEntries" })}: ${formatFullDate(entry.deleted_at, locale)}`,
  ]
    .filter(Boolean)
    .join(", ");
}
