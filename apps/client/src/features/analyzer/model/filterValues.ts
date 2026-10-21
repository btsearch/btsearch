import type { CellRat } from "@openbts/shared/contract";

import type { DifferenceField, DifferenceFilter, DifferenceKind } from "./types";
import { FIRST_LIST_PAGE } from "@/features/stations/list/data/listPaging";

export const ROW_STATUSES = ["found", "probable", "notFound"] as const;
export const ANALYZER_VIEWS = ["cells", "stations"] as const;
export const ANALYZER_SORTS = ["file", "station", "result"] as const;
export const ANALYZER_RATS: readonly CellRat[] = ["gsm", "umts", "lte", "nr"];
export const ANY_DIFFERENCE = "any";
export const DIFFERENCE_FIELDS: readonly DifferenceField[] = ["lac", "rnc", "uarfcn", "tac", "pci", "earfcn", "arfcn", "psc", "bsic"];
export const DIFFERENCE_KIND_ORDER: readonly DifferenceKind[] = [
  "tac",
  "pci",
  "no-pci",
  "new",
  "network",
  "lac",
  "rnc",
  "earfcn",
  "uarfcn",
  "arfcn",
  "no-tac",
  "no-lac",
  "no-rnc",
  "no-earfcn",
  "no-uarfcn",
  "no-arfcn",
  "psc",
  "no-psc",
  "bsic",
  "no-bsic",
  "by-lac",
  "shared",
  "unknown-cell",
  "unknown-operator",
  "no-identifiers",
];

export type AnalyzerFilters = {
  statuses: (typeof ROW_STATUSES)[number][];
  kinds: DifferenceFilter[];
  rats: CellRat[];
  operatorIds: number[];
  bandKeys: string[];
  isUnconfirmedOnly: boolean;
  view: (typeof ANALYZER_VIEWS)[number];
  sort: (typeof ANALYZER_SORTS)[number];
  page: number;
  pageSize: number | null;
};

export const DEFAULT_ANALYZER_FILTERS: AnalyzerFilters = {
  statuses: [],
  kinds: [],
  rats: [],
  operatorIds: [],
  bandKeys: [],
  isUnconfirmedOnly: false,
  view: "cells",
  sort: "file",
  page: FIRST_LIST_PAGE,
  pageSize: null,
};
