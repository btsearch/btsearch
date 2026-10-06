import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Fragment, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

import { BrandMark } from "@/components/cellular/brandMark";
import { Button } from "@/components/ui/button";
import { CountryCodeTile } from "@/components/ui/countryCodeTile";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InlineError } from "@/components/ui/error-state";
import { Spinner } from "@/components/ui/spinner";
import { ROW_PILL_COUNT_CLASS } from "@/features/map/components/search-overlay/mapFilterOperatorRows";
import { type OperatorRow, type OperatorRowFilters, listOperatorRows } from "@/features/map/components/search-overlay/mapFilterPanelRules";
import type { MapOperator } from "@/features/map/data/mapLookups";
import type { ListPanelScope } from "@/features/stations/list/data/listPanel";
import { getCountryName } from "@/lib/geo/countryName";
import { cn, toggleValue } from "@/lib/utils";

type PhotosOperatorMenuProps = {
  operatorIds: readonly number[];
  scope: ListPanelScope;
  onToggleOperator: (operatorId: number) => void;
};

type OperatorItemsProps = {
  entries: readonly MapOperator[];
  tickedOperatorIds: readonly number[];
  onToggleOperator: (operatorId: number) => void;
};

type CountryOperatorItemsProps = {
  row: OperatorRow;
  isFoldOpen: boolean;
  tickedOperatorIds: readonly number[];
  onToggleOperator: (operatorId: number) => void;
  onToggleFold: (countryCode: string) => void;
};

type CountryRowItemProps = {
  row: OperatorRow;
  isOpen: boolean;
  onToggleOpen: (countryCode: string) => void;
};

const NAME_SEPARATOR = ", ";
const CHEVRON_CLASS = "absolute right-2 size-3.5 text-muted-foreground transition-transform motion-reduce:transition-none";
const TRIGGER_CLASS = "h-8 w-full cursor-pointer justify-between font-normal";
const TICKED_COUNT_CLASS = cn(ROW_PILL_COUNT_CLASS, "shrink-0 !text-primary-foreground");

export function FilterMenuTrigger({ children }: { children: ReactNode }) {
  return (
    <DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" className={TRIGGER_CLASS} />}>
      {children}
      <HugeiconsIcon icon={ArrowDown01Icon} className="size-4 shrink-0 opacity-50" aria-hidden="true" />
    </DropdownMenuTrigger>
  );
}

function OperatorName({ entry }: { entry: MapOperator }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <BrandMark brand={entry.brand} size={16} />
      <span className="truncate">{entry.operator.name}</span>
    </span>
  );
}

function OperatorItems({ entries, tickedOperatorIds, onToggleOperator }: OperatorItemsProps) {
  return entries.map((entry) => (
    <DropdownMenuCheckboxItem
      key={entry.operator.id}
      checked={tickedOperatorIds.includes(entry.operator.id)}
      closeOnClick={false}
      className="cursor-pointer"
      onCheckedChange={() => onToggleOperator(entry.operator.id)}
    >
      <OperatorName entry={entry} />
    </DropdownMenuCheckboxItem>
  ));
}

function CountryOperatorItems({ row, isFoldOpen, tickedOperatorIds, onToggleOperator, onToggleFold }: CountryOperatorItemsProps) {
  const { t } = useTranslation("common");
  const foldedCount = row.foldedOperators.length;

  return (
    <>
      <OperatorItems entries={row.pinnedOperators} tickedOperatorIds={tickedOperatorIds} onToggleOperator={onToggleOperator} />
      {foldedCount > 0 ? (
        <DropdownMenuItem
          closeOnClick={false}
          aria-expanded={isFoldOpen}
          className="cursor-pointer pr-8 text-muted-foreground"
          onClick={() => onToggleFold(row.countryCode)}
        >
          <span className="truncate">{t("labels.otherOperators", { count: foldedCount })}</span>
          <HugeiconsIcon icon={ArrowDown01Icon} className={cn(CHEVRON_CLASS, isFoldOpen ? "rotate-180" : null)} aria-hidden="true" />
        </DropdownMenuItem>
      ) : null}
      {isFoldOpen ? <OperatorItems entries={row.foldedOperators} tickedOperatorIds={tickedOperatorIds} onToggleOperator={onToggleOperator} /> : null}
    </>
  );
}

function CountryRowItem({ row, isOpen, onToggleOpen }: CountryRowItemProps) {
  const { t, i18n } = useTranslation("main");
  const countryName = getCountryName(row.countryCode, i18n.language);
  const tickedCount = row.tickedOperatorCount;

  return (
    <DropdownMenuItem
      closeOnClick={false}
      aria-expanded={isOpen}
      aria-label={tickedCount > 0 ? t("filters.countrySelectedOperators", { country: countryName, count: tickedCount }) : undefined}
      className={cn("cursor-pointer pr-8", isOpen ? "bg-muted" : null)}
      onClick={() => onToggleOpen(row.countryCode)}
    >
      <CountryCodeTile code={row.countryCode} size="xs" />
      <span className="truncate">{countryName}</span>
      {tickedCount > 0 ? (
        <span aria-hidden="true" className={TICKED_COUNT_CLASS}>
          {tickedCount}
        </span>
      ) : null}
      <HugeiconsIcon icon={ArrowDown01Icon} className={cn(CHEVRON_CLASS, isOpen ? "rotate-180" : null)} aria-hidden="true" />
    </DropdownMenuItem>
  );
}

export function PhotosOperatorMenu({ operatorIds, scope, onToggleOperator }: PhotosOperatorMenuProps) {
  const { t, i18n } = useTranslation("common");
  const [foldOpenCountryCodes, setFoldOpenCountryCodes] = useState<string[]>([]);
  const [openRowCountryCodes, setOpenRowCountryCodes] = useState<string[]>([]);
  const { lookups, countries } = scope;
  const { language } = i18n;

  const rowFilters: OperatorRowFilters = { operatorIds: [...operatorIds], countryCodes: [...countries.picked], source: "internal" };
  const { rows, hasRowPills: hasFoldedCountries } = listOperatorRows(rowFilters, countries.mapCountries, lookups, language);
  const singleCountryGroup = rows.length === 1 ? lookups?.operatorGroups.get(rows[0].countryCode) : undefined;
  const tickedEntries = rows.flatMap((row) => row.pinnedOperators.filter((entry) => operatorIds.includes(entry.operator.id)));
  const [onlyTickedEntry] = tickedEntries;
  const isLoadingLookups = lookups === undefined && !scope.hasLookupsError;

  function toggleFold(countryCode: string) {
    setFoldOpenCountryCodes((current) => toggleValue(current, countryCode));
  }

  function toggleOpenRow(countryCode: string) {
    setOpenRowCountryCodes((current) => toggleValue(current, countryCode));
  }

  let triggerContent = <span className="truncate">{tickedEntries.map((entry) => entry.operator.name).join(NAME_SEPARATOR)}</span>;
  if (operatorIds.length === 0) triggerContent = <span className="truncate">{t("labels.allOperators")}</span>;
  else if (isLoadingLookups) triggerContent = <span className="truncate">{t("actions.loading")}</span>;
  else if (tickedEntries.length === 1) triggerContent = <OperatorName entry={onlyTickedEntry} />;

  const countryItems = rows.map((row, index) => {
    const operatorItems = (
      <CountryOperatorItems
        row={row}
        isFoldOpen={foldOpenCountryCodes.includes(row.countryCode)}
        tickedOperatorIds={operatorIds}
        onToggleOperator={onToggleOperator}
        onToggleFold={toggleFold}
      />
    );

    if (hasFoldedCountries) {
      const isOpen = openRowCountryCodes.includes(row.countryCode);
      return (
        <Fragment key={row.countryCode}>
          <CountryRowItem row={row} isOpen={isOpen} onToggleOpen={toggleOpenRow} />
          {isOpen ? operatorItems : null}
        </Fragment>
      );
    }

    return (
      <Fragment key={row.countryCode}>
        {index > 0 ? <DropdownMenuSeparator /> : null}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-1.5">
            <CountryCodeTile code={row.countryCode} size="xs" />
            <span className="truncate">{getCountryName(row.countryCode, language)}</span>
          </DropdownMenuLabel>
          {operatorItems}
        </DropdownMenuGroup>
      </Fragment>
    );
  });

  return (
    <DropdownMenu>
      <FilterMenuTrigger>
        <span className="flex min-w-0 items-center">{triggerContent}</span>
      </FilterMenuTrigger>
      <DropdownMenuContent align="start">
        {scope.hasLookupsError ? <InlineError size="sm" onRetry={scope.retryLookups} isRetrying={scope.isRetryingLookups} /> : null}
        {isLoadingLookups ? (
          <div className="flex justify-center py-2">
            <Spinner className="size-4" />
          </div>
        ) : null}
        {singleCountryGroup === undefined ? (
          countryItems
        ) : (
          <>
            <OperatorItems entries={singleCountryGroup.main} tickedOperatorIds={operatorIds} onToggleOperator={onToggleOperator} />
            {singleCountryGroup.main.length > 0 && singleCountryGroup.minor.length > 0 ? <DropdownMenuSeparator /> : null}
            <OperatorItems entries={singleCountryGroup.minor} tickedOperatorIds={operatorIds} onToggleOperator={onToggleOperator} />
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
