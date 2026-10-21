import { Delete02Icon, FullSignalIcon, MoreHorizontalIcon, PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { Country, Operator, SpectrumHolding } from "../../types";
import { CardAddButton, CountBadge } from "../shared/cardParts";
import { CardTable, CardTableCell, CardTableHead, CardTableRow } from "../shared/cardTable";
import { CenteredCardState, ReferenceCard, ReferenceCardHeader, ReferenceCardNote, ReferenceRowError, RowIconButton } from "../shared/referenceCards";
import { ReferenceSection } from "../shared/referenceSection";
import { MONO_TEXT_CLASS } from "../shared/values";
import { COUNTRY_SECTION_IDS } from "./countrySections";
import { SpectrumHoldingDeleteDialog } from "./spectrumHoldingDeleteDialog";
import { SpectrumHoldingDialog } from "./spectrumHoldingDialog";
import { type BrandLook, BrandMark } from "@/components/cellular/brandMark";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { bandsQueryOptions, brandsQueryOptions, operatorsQueryOptions, regionsQueryOptions } from "@/features/shared/lookups";
import { formatRange, holderBackground, sourceLink } from "@/features/spectrum/format";
import { type BandHoldings, groupHoldingsByBand, holdingOperators, toSpectrumOperator, widthKhz } from "@/features/spectrum/model";
import { countrySpectrumHoldingsQueryOptions } from "@/features/spectrum/queries";
import { useIsMobile } from "@/hooks/useMobile";
import { formatShortUtcDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type SpectrumSectionProps = { country: Country; canEdit: boolean };

type HoldingRowView = {
  holding: SpectrumHolding;
  name: string;
  brands: (BrandLook | null)[];
  downlink: string;
  uplink: string | null;
  region: string | null;
  validTo: string | null;
  source: string | null;
};

type HoldingListProps = {
  groups: readonly BandHoldings[];
  rowsOf: (group: BandHoldings) => HoldingRowView[];
  canEdit: boolean;
  onEdit: (holding: SpectrumHolding) => void;
  onDelete: (holding: SpectrumHolding) => void;
  colorsOf: (holding: SpectrumHolding) => string[];
};

const SKELETON_ROW_COUNT = 4;

function BandGroupTitle({ group, colorsOf }: { group: BandHoldings; colorsOf: (holding: SpectrumHolding) => string[] }) {
  const { t } = useTranslation("spectrum");
  const span = widthKhz(group.downlinkKhz);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span className="text-sm font-semibold whitespace-nowrap">
        {group.showsDuplex
          ? t("band.titleWithDuplex", { mhz: group.labelMhz, duplex: group.duplex.toUpperCase() })
          : t("band.title", { mhz: group.labelMhz })}
      </span>
      <span className="font-mono text-xs text-muted-foreground">{group.codes.join(" ")}</span>
      <span aria-hidden="true" className="relative ml-auto h-2 w-40 overflow-hidden rounded-sm bg-muted">
        {group.holdings
          .filter((holding) => holding.regionId === null)
          .map((holding) => (
            <span
              key={holding.id}
              className="absolute inset-y-0"
              style={{
                left: `${((holding.downlinkKhz[0] - group.downlinkKhz[0]) / span) * 100}%`,
                width: `${(widthKhz(holding.downlinkKhz) / span) * 100}%`,
                background: holderBackground(colorsOf(holding)),
              }}
            />
          ))}
      </span>
    </div>
  );
}

function HoldingTableHead({ canEdit }: { canEdit: boolean }) {
  const { t } = useTranslation(["admin", "spectrum"]);

  return (
    <>
      <CardTableHead>{t("spectrum:summary.operator")}</CardTableHead>
      <CardTableHead className="w-40">{t("spectrum:band.downlink")}</CardTableHead>
      <CardTableHead className="w-40">{t("spectrum:band.uplink")}</CardTableHead>
      <CardTableHead className="w-36">{t("reference.country.spectrum.columns.region")}</CardTableHead>
      <CardTableHead className="w-32">{t("spectrum:holding.validTo")}</CardTableHead>
      <CardTableHead className="w-44">{t("spectrum:holding.source")}</CardTableHead>
      {canEdit ? <CardTableHead className="w-19" /> : null}
    </>
  );
}

function HoldingTable({ groups, rowsOf, canEdit, onEdit, onDelete, colorsOf }: HoldingListProps) {
  const { t } = useTranslation("admin");
  const columnCount = canEdit ? 7 : 6;

  return (
    <CardTable aria-label={t("reference.country.spectrum.title")} head={<HoldingTableHead canEdit={canEdit} />}>
      {groups.map((group) => (
        <HoldingTableGroup
          key={group.key}
          group={group}
          rows={rowsOf(group)}
          columnCount={columnCount}
          canEdit={canEdit}
          onEdit={onEdit}
          onDelete={onDelete}
          colorsOf={colorsOf}
        />
      ))}
    </CardTable>
  );
}

type HoldingTableGroupProps = Pick<HoldingListProps, "canEdit" | "onEdit" | "onDelete" | "colorsOf"> & {
  group: BandHoldings;
  rows: HoldingRowView[];
  columnCount: number;
};

function HoldingTableGroup({ group, rows, columnCount, canEdit, onEdit, onDelete, colorsOf }: HoldingTableGroupProps) {
  const { t } = useTranslation("admin");

  return (
    <>
      <CardTableRow className="bg-muted/30 hover:bg-muted/30">
        <CardTableCell colSpan={columnCount}>
          <BandGroupTitle group={group} colorsOf={colorsOf} />
        </CardTableCell>
      </CardTableRow>
      {rows.map((row) => (
        <CardTableRow key={row.holding.id}>
          <CardTableCell>
            <span className="flex min-w-0 items-center gap-2 font-medium">
              {row.brands.map((brand, index) => (
                <BrandMark key={index} brand={brand} />
              ))}
              <span className="truncate">{row.name}</span>
            </span>
          </CardTableCell>
          <CardTableCell className={MONO_TEXT_CLASS}>{row.downlink}</CardTableCell>
          <CardTableCell className={cn(MONO_TEXT_CLASS, row.uplink === null && "text-muted-foreground")}>{row.uplink ?? "-"}</CardTableCell>
          <CardTableCell className={row.region === null ? "text-muted-foreground" : undefined}>
            {row.region ?? t("reference.country.spectrum.wholeCountry")}
          </CardTableCell>
          <CardTableCell className={cn("tabular-nums", row.validTo === null && "text-muted-foreground")}>
            {row.validTo ?? t("reference.country.spectrum.noEndDate")}
          </CardTableCell>
          <CardTableCell className="max-w-44 truncate text-muted-foreground">{row.source ?? "-"}</CardTableCell>
          {canEdit ? (
            <CardTableCell align="end">
              <div className="flex items-center justify-end gap-0.5">
                <RowIconButton
                  label={t("reference.country.spectrum.edit", { name: row.name })}
                  icon={PencilEdit02Icon}
                  onClick={() => onEdit(row.holding)}
                />
                <RowIconButton
                  label={t("reference.country.spectrum.delete", { name: row.name })}
                  icon={Delete02Icon}
                  destructive
                  onClick={() => onDelete(row.holding)}
                />
              </div>
            </CardTableCell>
          ) : null}
        </CardTableRow>
      ))}
    </>
  );
}

function HoldingRowMenu({ name, onEdit, onDelete }: { name: string; onEdit: () => void; onDelete: () => void }) {
  const { t } = useTranslation("admin");
  const label = t("reference.country.spectrum.rowActions", { name });

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={<Button type="button" variant="ghost" size="icon-sm" aria-label={label} className="cursor-pointer text-muted-foreground" />}
            />
          }
        >
          <HugeiconsIcon icon={MoreHorizontalIcon} aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuItem className="cursor-pointer" onClick={onEdit}>
          <HugeiconsIcon icon={PencilEdit02Icon} aria-hidden="true" />
          {t("common:actions.edit")}
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" className="cursor-pointer" onClick={onDelete}>
          <HugeiconsIcon icon={Delete02Icon} aria-hidden="true" />
          {t("common:actions.delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function HoldingMobileList({ groups, rowsOf, canEdit, onEdit, onDelete, colorsOf }: HoldingListProps) {
  const { t } = useTranslation("admin");

  return (
    <div>
      {groups.map((group) => (
        <section key={group.key} className="border-t px-4 pt-3">
          <BandGroupTitle group={group} colorsOf={colorsOf} />
          <ul className="mt-1">
            {rowsOf(group).map((row) => (
              <li key={row.holding.id} className={cn("flex items-center gap-3 border-t py-2.5 first:border-t-0", canEdit ? "pr-0" : "pr-2")}>
                <div className="min-w-0 flex-1">
                  <p className="flex min-w-0 items-center gap-1.5 text-sm leading-5 font-medium">
                    {row.brands.map((brand, index) => (
                      <BrandMark key={index} brand={brand} />
                    ))}
                    <span className="truncate">{row.name}</span>
                  </p>
                  <p className="font-mono text-xs leading-4 text-muted-foreground tabular-nums">
                    {row.uplink === null ? row.downlink : `${row.downlink} / ${row.uplink}`}
                  </p>
                </div>
                <span className="shrink-0 text-xs leading-4 whitespace-nowrap text-muted-foreground">
                  {row.validTo ?? t("reference.country.spectrum.noEndDate")}
                </span>
                {canEdit ? <HoldingRowMenu name={row.name} onEdit={() => onEdit(row.holding)} onDelete={() => onDelete(row.holding)} /> : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function HoldingTableSkeleton({ canEdit }: { canEdit: boolean }) {
  return (
    <CardTable head={<HoldingTableHead canEdit={canEdit} />}>
      {Array.from({ length: SKELETON_ROW_COUNT }, (_, rowIndex) => (
        <CardTableRow key={rowIndex} aria-hidden="true" className="hover:bg-transparent">
          <CardTableCell>
            <Skeleton className="h-4 w-28" />
          </CardTableCell>
          <CardTableCell>
            <Skeleton className="h-4 w-28" />
          </CardTableCell>
          <CardTableCell>
            <Skeleton className="h-4 w-28" />
          </CardTableCell>
          <CardTableCell>
            <Skeleton className="h-4 w-20" />
          </CardTableCell>
          <CardTableCell>
            <Skeleton className="h-4 w-20" />
          </CardTableCell>
          <CardTableCell>
            <Skeleton className="h-4 w-24" />
          </CardTableCell>
          {canEdit ? <CardTableCell /> : null}
        </CardTableRow>
      ))}
    </CardTable>
  );
}

export function SpectrumSection({ country, canEdit }: SpectrumSectionProps) {
  const { t, i18n } = useTranslation("admin");
  const isMobile = useIsMobile();
  const [dialogHolding, setDialogHolding] = useState<SpectrumHolding | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [holdingToDelete, setHoldingToDelete] = useState<SpectrumHolding | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const holdingsQuery = useQuery(countrySpectrumHoldingsQueryOptions(country.code));
  const operatorsQuery = useQuery(operatorsQueryOptions());
  const { data: brands } = useQuery(brandsQueryOptions());
  const planBandsQuery = useQuery(bandsQueryOptions({ countryCode: country.code }));
  const { data: regions } = useQuery(regionsQueryOptions({ countryCode: country.code }));

  const operators = operatorsQuery.data;
  const countryOperators: Operator[] = operators?.filter((operator) => operator.countryCode === country.code) ?? [];
  const holdings = operators === undefined ? undefined : holdingsQuery.data;
  const groups = holdings === undefined || planBandsQuery.data === undefined ? undefined : groupHoldingsByBand(holdings, planBandsQuery.data);
  const hasLoadFailed = holdingsQuery.isError || operatorsQuery.isError || planBandsQuery.isError;
  const operatorById = new Map(countryOperators.map((operator) => [operator.id, toSpectrumOperator(operator, brands ?? [])]));
  const regionNameById = new Map((regions ?? []).map((region) => [region.id, region.name]));

  function nameOf(holding: SpectrumHolding): string {
    const [operator, jointOperator] = holdingOperators(holding, operatorById);
    if (operator === undefined) return String(holding.operatorId);
    return jointOperator === undefined ? operator.name : t("spectrum:holding.jointNames", { first: operator.name, second: jointOperator.name });
  }

  function rowsOf(group: BandHoldings): HoldingRowView[] {
    return group.holdings.map((holding) => {
      const holders = holdingOperators(holding, operatorById);
      const source = holding.source === null ? null : (sourceLink(holding.source)?.label ?? holding.source);
      return {
        holding,
        name: nameOf(holding),
        brands: holders.length === 0 ? [null] : holders.map((operator) => operator.brand),
        downlink: formatRange(t, holding.downlinkKhz),
        uplink: holding.uplinkKhz === null ? null : formatRange(t, holding.uplinkKhz),
        region: holding.regionId === null ? null : (regionNameById.get(holding.regionId) ?? null),
        validTo: holding.validTo === null ? null : formatShortUtcDate(holding.validTo, i18n.language),
        source,
      };
    });
  }

  function colorsOf(holding: SpectrumHolding): string[] {
    return holdingOperators(holding, operatorById).map((operator) => operator.color);
  }

  function openAddDialog() {
    setDialogHolding(null);
    setIsDialogOpen(true);
  }

  function openEditDialog(holding: SpectrumHolding) {
    setDialogHolding(holding);
    setIsDialogOpen(true);
  }

  function openDeleteDialog(holding: SpectrumHolding) {
    setHoldingToDelete(holding);
    setIsDeleteOpen(true);
  }

  function renderBody() {
    if (groups === undefined) {
      if (hasLoadFailed) {
        return (
          <div className="border-t">
            <ReferenceRowError
              title={t("reference.country.spectrum.loadFailed")}
              onRetry={() => void Promise.all([holdingsQuery.refetch(), operatorsQuery.refetch(), planBandsQuery.refetch()])}
              isRetrying={holdingsQuery.isFetching || operatorsQuery.isFetching || planBandsQuery.isFetching}
            />
          </div>
        );
      }
      return <HoldingTableSkeleton canEdit={canEdit} />;
    }
    if (groups.length === 0) {
      return (
        <CenteredCardState
          icon={FullSignalIcon}
          title={t("reference.country.spectrum.empty.title")}
          description={canEdit ? t("reference.country.spectrum.empty.description") : t("reference.country.spectrum.empty.readOnlyDescription")}
          action={canEdit ? <CardAddButton variant="outline" label={t("reference.country.spectrum.add")} onClick={openAddDialog} /> : undefined}
        />
      );
    }

    const listProps = { groups, rowsOf, canEdit, onEdit: openEditDialog, onDelete: openDeleteDialog, colorsOf };
    return isMobile ? <HoldingMobileList {...listProps} /> : <HoldingTable {...listProps} />;
  }

  return (
    <ReferenceSection id={COUNTRY_SECTION_IDS.spectrum} title={t("reference.country.spectrum.title")}>
      <ReferenceCard>
        <ReferenceCardHeader
          title={t("reference.country.spectrum.title")}
          description={isMobile ? undefined : t("reference.country.spectrum.description")}
          badge={holdings === undefined ? undefined : <CountBadge>{holdings.length.toLocaleString(i18n.language)}</CountBadge>}
          action={canEdit ? <CardAddButton label={t("reference.country.spectrum.add")} isCompactOnPhones onClick={openAddDialog} /> : null}
        />
        {renderBody()}
        <ReferenceCardNote>{t("reference.country.spectrum.bandPlanNote")}</ReferenceCardNote>
      </ReferenceCard>
      {canEdit && holdings !== undefined && planBandsQuery.data !== undefined ? (
        <>
          <SpectrumHoldingDialog
            country={country}
            holding={dialogHolding}
            holdings={holdings}
            operators={countryOperators}
            brands={brands ?? []}
            planBands={planBandsQuery.data}
            regions={regions ?? []}
            open={isDialogOpen}
            onOpenChange={setIsDialogOpen}
          />
          {holdingToDelete === null ? null : (
            <SpectrumHoldingDeleteDialog
              holding={holdingToDelete}
              operatorName={nameOf(holdingToDelete)}
              open={isDeleteOpen}
              onOpenChange={setIsDeleteOpen}
            />
          )}
        </>
      ) : null}
    </ReferenceSection>
  );
}
