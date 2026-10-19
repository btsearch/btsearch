import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import {
  type StationsListVariant,
  clearStationsListFilters,
  countActiveStationsListFilters,
  setStationsListSearchText,
} from "../data/stationsListFilters";
import type { StationsListSearch } from "../data/stationsListSearch";
import { useStationsListState } from "../data/stationsListState";
import { ListFrame } from "./frame/listFrame";
import { ListSearchRejectedNote } from "./frame/listSearchRejectedNote";
import { StationsListMobileFilters } from "./panel/stationsListMobileFilters";
import { StationsListPanel } from "./panel/stationsListPanel";
import { StationsListCount } from "./table/stationsListCount";
import { STATIONS_TOUCH_NARROWEST_TABLE_WIDTH } from "./table/stationsListLayout";
import { StationsListTable } from "./table/stationsListTable";
import { useStationsListTable } from "./table/useStationsListTable";
import { buttonVariants } from "@/components/ui/button";
import { EDITOR_STATION_SEARCH } from "@/features/admin/stations/editorStationSearch";
import { SearchProblemNote } from "@/features/map/components/search-overlay/searchProblemNote";
import { findQueryProblem, replaceSearchKeyword } from "@/features/map/searchAutocomplete";
import { STATIONS_FILTER_KEYWORDS, StationsSearchControl } from "@/features/stations/components/stationsSearchControl";
import { useIsCoarsePointer } from "@/hooks/useCoarsePointer";
import { useIsMobile } from "@/hooks/useMobile";
import { cn } from "@/lib/utils";

type StationsListPageProps = {
  variant: StationsListVariant;
  search: StationsListSearch;
  onSearchChange: (search: StationsListSearch) => void;
};

const NEW_STATION_LINK_CLASS = cn(buttonVariants({ size: "sm" }));

function NewStationLink() {
  const { t } = useTranslation("stations");
  const label = t("actions.newStation");

  return (
    <Link to="/admin/stations/$id" params={{ id: "new" }} search={EDITOR_STATION_SEARCH} aria-label={label} className={NEW_STATION_LINK_CLASS}>
      <HugeiconsIcon icon={Add01Icon} className="size-4 sm:mr-0.5" aria-hidden="true" />
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}

export function StationsListPage({ variant, search, onSearchChange }: StationsListPageProps) {
  const { t } = useTranslation(["stations", "nav"]);
  const isMobile = useIsMobile();
  const isCoarsePointer = useIsCoarsePointer();
  const { filters, readiness, changeFilters } = useStationsListState({ search, variant, onSearchChange });
  const { page, table } = useStationsListTable({ filters, onFiltersChange: changeFilters, variant, readiness });
  const isAdminList = variant === "admin";
  const searchProblemNoteId = useId();
  const searchProblem = findQueryProblem(filters.searchText, STATIONS_FILTER_KEYWORDS);

  function changeSearchText(searchText: string) {
    changeFilters((current) => setStationsListSearchText(current, searchText));
  }

  function fixSearchProblem() {
    if (searchProblem?.kind !== "unknownKeyword") return;
    changeSearchText(replaceSearchKeyword(filters.searchText, searchProblem.typed, searchProblem.suggestion));
  }

  let searchNote = page.isSearchRejected ? <ListSearchRejectedNote /> : null;
  if (searchProblem !== null)
    searchNote = <SearchProblemNote id={searchProblemNoteId} problem={searchProblem} onFix={fixSearchProblem} className="pl-[13px]" />;

  return (
    <ListFrame
      title={isAdminList ? t("nav:items.stations") : t("stations:database.title")}
      count={<StationsListCount page={page} />}
      action={isAdminList ? <NewStationLink /> : undefined}
      search={
        <StationsSearchControl
          searchQuery={filters.searchText}
          onSearchQueryChange={changeSearchText}
          describedBy={searchProblem === null ? undefined : searchProblemNoteId}
          placeholder={isMobile ? t("stations:list.searchPlaceholderShort") : t("stations:list.searchPlaceholder")}
        />
      }
      searchNote={searchNote}
      panel={<StationsListPanel filters={filters} onFiltersChange={changeFilters} variant={variant} />}
      mobileFilters={<StationsListMobileFilters filters={filters} onFiltersChange={changeFilters} variant={variant} />}
      activeFilterCount={countActiveStationsListFilters(filters)}
      onClearFilters={() => changeFilters(clearStationsListFilters)}
      narrowestTableWidth={isAdminList && isCoarsePointer ? STATIONS_TOUCH_NARROWEST_TABLE_WIDTH : undefined}
    >
      <StationsListTable table={table} />
    </ListFrame>
  );
}
