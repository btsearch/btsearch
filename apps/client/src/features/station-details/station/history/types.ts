import type { StationHistoryCell, StationHistoryChange } from "@openbts/shared/contract";

export type {
  StationHistoryAction,
  StationHistoryCell,
  StationHistoryChange,
  StationHistoryItem,
  StationHistoryList,
  StationHistoryLocation,
  StationHistoryPhoto,
  StationHistoryValue,
} from "@openbts/shared/contract";

type HistoryFieldsPart = Extract<StationHistoryChange, { fields: unknown }>;

export type HistoryPartKind = StationHistoryChange["kind"];
export type HistoryCellsPart = Extract<StationHistoryChange, { kind: "cells" }>;
export type HistoryPhotosPart = Extract<StationHistoryChange, { kind: "photos" }>;
export type HistoryFieldChange = HistoryFieldsPart["fields"][number] | StationHistoryCell["fields"][number];
export type HistoryFieldName = HistoryFieldChange["field"];
export type HistoryLine = { key: string; label: string; from: string | null; to: string | null };
