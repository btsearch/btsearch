import type { DeletedEntrySource, DeletedEntrySourceFilter } from "./types";

export const DELETED_ENTRIES_MAX_PAGE_SIZE = 100;

export const DELETED_ENTRY_SOURCE_FILTERS: DeletedEntrySourceFilter[] = ["all", "permits", "device_registry", "radiolines"];

export const DELETED_ENTRY_SOURCE_TABLES: Record<DeletedEntrySource, "uke_permits" | "uke_radiolines"> = {
  permits: "uke_permits",
  device_registry: "uke_permits",
  radiolines: "uke_radiolines",
};
