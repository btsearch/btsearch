export type DeletedEntrySource = "permits" | "device_registry" | "radiolines";
export type DeletedEntrySourceFilter = DeletedEntrySource | "all";
export type DeletedEntriesSort = "asc" | "desc";

export interface DeletedEntry {
  id: number;
  source_table: string;
  source_id: number;
  source_type: DeletedEntrySource;
  data: Record<string, unknown>;
  deleted_at: string;
  import_id: number | null;
}

export type DeletedEntriesFilters = {
  page: number;
  limit: number;
  sort: DeletedEntriesSort;
  source: DeletedEntrySourceFilter;
  from?: string;
  to?: string;
  search?: string;
};
