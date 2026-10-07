import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useAnalyzerAllowance } from "../data/allowance";
import { saveAnalyzerDraft } from "../data/draftStore";
import { listSessionCountryCodes, useAnalyzerLookups } from "../data/lookups";
import { type AnalyzerSession, analyzerSession, useAnalyzerSession } from "../data/session";
import { buildAnalyzerDraft } from "../model/draft";
import {
  ANY_DIFFERENCE,
  type AnalyzerFilters,
  clearAnalyzerFilters,
  countActiveAnalyzerFilters,
  countFacets,
  listBandFacets,
  listFileCountryCodes,
  listFileOperatorGroups,
  listFilteredIndexes,
  moveAnalyzerToFirstPage,
} from "../model/filters";
import { buildRowFacts } from "../model/rows";
import { type AnalyzerSearch, readAnalyzerFilters, toAnalyzerSearch } from "../model/search";
import {
  type SelectionProblem,
  type SelectionSummary,
  type TickMark,
  getSelectionProblem,
  getTickMark,
  summarizeSelection,
  toggleRows,
} from "../model/selection";
import type { AnalyzerLookups, AnalyzerViewer, RowFacts } from "../model/types";
import { type TableItem, listPageItems, sortIndexes } from "../model/views";
import { ANALYZER_CARD_HEIGHT, ANALYZER_PHONE_PAGE_SIZE } from "./analyzerLayout";
import type { AnalyzerFiltersChange, AnalyzerPanelData } from "./analyzerTypes";
import { sortCountryCodesByName } from "@/features/map/data/mapCountries";
import { useMapLookups } from "@/features/map/data/mapLookups";
import { type ListTablePaging, useListTablePaging } from "@/features/stations/list/components/table/useListTablePaging";
import { FIRST_LIST_PAGE, getListPageCount } from "@/features/stations/list/data/listPaging";
import { useIsMobile } from "@/hooks/useMobile";
import { useSettledSession } from "@/hooks/useSettledSession";

type UseAnalyzerPageArgs = {
  search: AnalyzerSearch;
  onSearchChange: (search: AnalyzerSearch) => void;
};

type LatestState = {
  filters: AnalyzerFilters;
  onSearchChange: (search: AnalyzerSearch) => void;
};

type PageItems = {
  items: TableItem[];
  rowIndexes: number[];
};

type AnalyzerTablePage = PageItems & {
  number: number;
  count: number;
  mark: TickMark;
};

type AnalyzerSelection = {
  summary: SelectionSummary;
  problem: SelectionProblem | null;
  toggleRow: (index: number, isTicked: boolean) => void;
  toggleRowGroup: (indexes: readonly number[]) => void;
  tickAllMatching: () => void;
  clear: () => void;
  openBatch: () => void;
};

export type AnalyzerPageModel = {
  viewer: AnalyzerViewer;
  session: AnalyzerSession;
  filters: AnalyzerFilters;
  changeFilters: AnalyzerFiltersChange;
  clearFilters: () => void;
  showFirstPage: () => void;
  activeFilterCount: number;
  hasResults: boolean;
  lookups: AnalyzerLookups | null;
  facts: readonly RowFacts[];
  panel: AnalyzerPanelData;
  hasBandPlanError: boolean;
  hasCountryTiles: boolean;
  filteredCount: number;
  isNothingToChange: boolean;
  isMobile: boolean;
  paging: ListTablePaging;
  page: AnalyzerTablePage;
  selection: AnalyzerSelection;
};

const STAFF_STATION_CAP = 50;
const USER_STATION_CAP = 25;
const SIGNED_OUT_USER_ID = "";
const ESCAPE_KEY = "Escape";
const UNMEASURED_PAGE_SIZE = 1;
const NO_SELECTION: ReadonlySet<number> = new Set();
const NO_PAGE_ITEMS: PageItems = { items: [], rowIndexes: [] };

export function useAnalyzerPage({ search, onSearchChange }: UseAnalyzerPageArgs): AnalyzerPageModel {
  const { t, i18n } = useTranslation("cellAnalyzer");
  const { language } = i18n;
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { data: authSession } = useSettledSession();
  const session = useAnalyzerSession();
  const { lookups: mapLookups } = useMapLookups();
  const userId = authSession?.user?.id;
  const role = authSession?.user?.role;
  const isStaff = role === "editor" || role === "admin";
  const allowance = useAnalyzerAllowance(userId);
  const viewer = useMemo<AnalyzerViewer>(
    () => ({ userId: userId ?? SIGNED_OUT_USER_ID, isStaff, stationCap: isStaff ? STAFF_STATION_CAP : USER_STATION_CAP }),
    [userId, isStaff],
  );

  const filters = useMemo(() => readAnalyzerFilters(search), [search]);
  const { results: resultWords, diffs, rats, operators, bands, confirmation } = search;
  const rowFilters = useMemo(
    () => readAnalyzerFilters({ results: resultWords, diffs, rats, operators, bands, confirmation }),
    [resultWords, diffs, rats, operators, bands, confirmation],
  );
  const latest = useRef<LatestState>({ filters, onSearchChange });
  const isOpeningBatch = useRef(false);

  useLayoutEffect(() => {
    latest.current.filters = filters;
  }, [filters]);

  useLayoutEffect(() => {
    latest.current.onSearchChange = onSearchChange;
  }, [onSearchChange]);

  const changeFilters = useCallback<AnalyzerFiltersChange>((change) => {
    const current = latest.current;
    const changedFilters = change(current.filters);
    if (changedFilters === current.filters) return;

    const nextSearch = toAnalyzerSearch(moveAnalyzerToFirstPage(current.filters, changedFilters));
    current.filters = readAnalyzerFilters(nextSearch);
    current.onSearchChange(nextSearch);
  }, []);

  const { rows, results, tables, selected } = session;
  const hasResults = results !== null;
  const sessionCountryCodes = useMemo(() => listSessionCountryCodes(mapLookups, rows, results), [mapLookups, rows, results]);
  const lookupsState = useAnalyzerLookups(sessionCountryCodes);
  const { lookups, mapLookups: panelLookups, hasFailed: hasLookupsError, isRetrying: isRetryingLookups, retry: retryLookups } = lookupsState;

  const facts = useMemo(() => buildRowFacts({ rows, results, tables, lookups, isStaff }), [rows, results, tables, lookups, isStaff]);
  const counts = useMemo(() => countFacets(facts), [facts]);
  const fileCountryCodes = useMemo(() => sortCountryCodesByName(listFileCountryCodes(facts), language), [facts, language]);
  const bandFacets = useMemo(
    () => (lookups === null ? [] : listBandFacets(facts, counts, lookups, fileCountryCodes, rowFilters.bandKeys)),
    [facts, counts, lookups, fileCountryCodes, rowFilters.bandKeys],
  );
  const operatorLookups = useMemo(
    () => (panelLookups === undefined || lookups === null ? undefined : { ...panelLookups, operatorGroups: listFileOperatorGroups(counts, lookups) }),
    [panelLookups, lookups, counts],
  );
  const panel = useMemo<AnalyzerPanelData>(
    () => ({ counts, hasResults, bandFacets, operatorLookups, fileCountryCodes, hasLookupsError, isRetryingLookups, retryLookups }),
    [counts, hasResults, bandFacets, operatorLookups, fileCountryCodes, hasLookupsError, isRetryingLookups, retryLookups],
  );

  const filtered = useMemo(() => listFilteredIndexes(facts, rowFilters, hasResults), [facts, rowFilters, hasResults]);
  const sorted = useMemo(() => sortIndexes(filtered, facts, tables, filters.sort), [filtered, facts, tables, filters.sort]);
  const pagedFilters: AnalyzerFilters = isMobile ? { ...filters, pageSize: ANALYZER_PHONE_PAGE_SIZE } : filters;
  const paging = useListTablePaging(pagedFilters, changeFilters, ANALYZER_CARD_HEIGHT);
  const { pageSize } = paging;
  const pageItems = useMemo(
    () => (pageSize === null ? NO_PAGE_ITEMS : listPageItems(sorted, facts, filters, pageSize)),
    [sorted, facts, filters, pageSize],
  );
  const summary = useMemo(
    () => summarizeSelection(selected, facts, filtered, pageItems.rowIndexes),
    [selected, facts, filtered, pageItems.rowIndexes],
  );
  const hasTicks = selected.size > 0;

  useEffect(() => {
    if (!hasTicks) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.key !== ESCAPE_KEY) return;
      analyzerSession.setSelected(NO_SELECTION, isStaff);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasTicks, isStaff]);

  function toggleRow(index: number, isTicked: boolean) {
    analyzerSession.setSelected(toggleRows(analyzerSession.getSnapshot().selected, [index], facts, isTicked), isStaff);
  }

  function toggleRowGroup(indexes: readonly number[]) {
    const tickedRows = analyzerSession.getSnapshot().selected;
    const isTicked = getTickMark(indexes, facts, tickedRows) !== "on";
    analyzerSession.setSelected(toggleRows(tickedRows, indexes, facts, isTicked), isStaff);
  }

  function tickAllMatching() {
    analyzerSession.setSelected(toggleRows(analyzerSession.getSnapshot().selected, filtered, facts, true), isStaff);
  }

  function clearSelection() {
    analyzerSession.setSelected(NO_SELECTION, isStaff);
  }

  function openBatch() {
    if (isOpeningBatch.current) return;

    const draftId = saveAnalyzerDraft(buildAnalyzerDraft({ session, facts, search: toAnalyzerSearch(filters) }));
    if (draftId === null) {
      toast.error(t("errors.draftSaveFailed"));
      return;
    }
    isOpeningBatch.current = true;
    void navigate({ to: "/submission/from-analyzer", search: { draft: draftId } }).finally(() => {
      isOpeningBatch.current = false;
    });
  }

  function showFirstPage() {
    changeFilters((current) => (current.page === FIRST_LIST_PAGE ? current : { ...current, page: FIRST_LIST_PAGE }));
  }

  function clearFilters() {
    changeFilters(clearAnalyzerFilters);
  }

  const pageCount = getListPageCount(filtered.length, pageSize ?? UNMEASURED_PAGE_SIZE);
  const page: AnalyzerTablePage = {
    ...pageItems,
    number: Math.min(Math.max(FIRST_LIST_PAGE, filters.page), pageCount),
    count: pageCount,
    mark: getTickMark(pageItems.rowIndexes, facts, selected),
  };
  const isAnyDifferenceTicked = hasResults && filters.kinds.includes(ANY_DIFFERENCE);

  return {
    viewer,
    session,
    filters,
    changeFilters,
    clearFilters,
    showFirstPage,
    activeFilterCount: countActiveAnalyzerFilters(filters, hasResults),
    hasResults,
    lookups,
    facts,
    panel,
    hasBandPlanError: lookupsState.hasFailedPlans,
    hasCountryTiles: fileCountryCodes.length > 1,
    filteredCount: filtered.length,
    isNothingToChange: isAnyDifferenceTicked && filtered.length === 0 && facts.every((row) => !row.tick.canTick),
    isMobile,
    paging,
    page,
    selection: {
      summary,
      problem: getSelectionProblem(summary, viewer, allowance),
      toggleRow,
      toggleRowGroup,
      tickAllMatching,
      clear: clearSelection,
      openBatch,
    },
  };
}
