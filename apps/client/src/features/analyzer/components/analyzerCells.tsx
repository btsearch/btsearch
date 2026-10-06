import { AlertCircleIcon, Cancel01Icon, CheckmarkCircle02Icon, Note01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type { OfficialSiteRef, Station } from "@openbts/shared/contract";
import { useQueryClient } from "@tanstack/react-query";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";

import { buildIdChips } from "../model/rows";
import type { IdChip, RowStatus } from "../model/types";
import {
  ANALYZER_DESCRIPTION_ICON_CLASS,
  ANALYZER_DESCRIPTION_TEXT_CLASS,
  ANALYZER_REGION_CLASS,
  ANALYZER_SECOND_LINE_CLASS,
} from "./analyzerLayout";
import { useAnalyzerTexts } from "./analyzerTexts";
import type { RowOpeners, RowView, StationView } from "./rowView";
import { BrandMark } from "@/components/cellular/brandMark";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyValue } from "@/components/ui/emptyValue";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useFloatingDialogStack } from "@/features/floating-dialogs/components/floatingDialogStackProvider";
import { getBandCode, getBandLabel, toRatType } from "@/features/station-details/station/utils/bands";
import { LIST_DETAIL_SEPARATOR, ListCountryTile, ListIconMark } from "@/features/stations/list/components/table/listCells";
import { LIST_ROW_LINK_CLASS } from "@/features/stations/list/components/table/listTableRow";
import { STATION_ID_CLASS } from "@/features/stations/list/components/table/stationsListCells";
import { showApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

type RowViewProps = {
  view: RowView;
};

type RowLineProps = RowViewProps & {
  isSingleLine?: boolean;
};

type RowTickProps = RowViewProps & {
  isTicked: boolean;
  onToggle: (index: number, isTicked: boolean) => void;
};

type StationIdButtonProps = {
  station: Station;
  className?: string;
  onOpen: (station: Station) => void;
};

type StationPlaceProps = {
  stationView: StationView;
  hasCountryTile: boolean;
  hasRegion?: boolean;
};

type RegisterSiteProps = {
  site: OfficialSiteRef;
  onOpen: (site: OfficialSiteRef) => void;
};

type RegisterHintProps = {
  sites: readonly OfficialSiteRef[];
  hasMoreSites?: boolean;
  onOpen: (site: OfficialSiteRef) => void;
};

type MatchCellProps = RowViewProps & {
  hasCountryTile: boolean;
  openers: RowOpeners;
};

const REGISTER_TAG = "UKE";
const PLMN_LABEL = "PLMN";
const PLACE_SEPARATOR = ", ";
const CHANNEL_FIELDS: ReadonlySet<string> = new Set(["earfcn", "uarfcn", "arfcn"]);
const UNCONFIRMED_MARK_CLASS = "inline-flex size-4 shrink-0 cursor-help items-center justify-center rounded-sm bg-destructive/10 text-destructive";
const OPERATOR_NAME_CLASS = "min-w-0 truncate text-[13.5px] leading-5 font-medium";
const CHIP_CLASS = "inline-flex h-4 shrink-0 items-center gap-1 rounded-[5px] px-[5px] text-[11px] leading-[14px] font-medium whitespace-nowrap";
const CHIP_VALUE_CLASS = "font-mono font-semibold tabular-nums text-foreground";
const CHIP_LINE_CLASS = "flex min-w-0 flex-wrap items-center gap-1 md:flex-nowrap md:overflow-hidden";
const REGISTER_TAG_CLASS = "h-4 bg-muted px-1.5 py-0 text-[10px] font-semibold whitespace-nowrap text-muted-foreground";
const REGISTER_SITE_CLASS = cn("shrink-0 cursor-pointer font-mono text-xs leading-4 font-medium tabular-nums text-foreground", LIST_ROW_LINK_CLASS);
const MORE_SITES_CLASS = cn(
  "inline-flex h-4 shrink-0 cursor-pointer items-center rounded-[5px] bg-muted px-[5px] text-[11px] leading-none font-semibold",
  "text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
);
const RESULT_BADGE_CLASS = "inline-flex h-5 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] leading-none font-semibold whitespace-nowrap";
const RESULT_BADGES: Record<RowStatus, { icon: IconSvgElement; className: string }> = {
  found: { icon: CheckmarkCircle02Icon, className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  probable: { icon: AlertCircleIcon, className: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  notFound: { icon: Cancel01Icon, className: "bg-red-500/10 text-red-700 dark:text-red-400" },
  pending: { icon: AlertCircleIcon, className: "bg-muted text-muted-foreground" },
};

export function useRowOpeners(): RowOpeners {
  const queryClient = useQueryClient();
  const { openStationDialog, openUkePermitDialog } = useFloatingDialogStack();

  function openStation(station: Station) {
    openStationDialog(station.id, "internal", station.location?.id);
  }

  function openOfficialSite(site: OfficialSiteRef) {
    void queryClient
      .query({
        queryKey: ["uke-station", site.id],
        queryFn: () => import("@/features/station-details/api").then((module) => module.fetchUkeStation(site.id)),
      })
      .then(openUkePermitDialog)
      .catch(showApiError);
  }

  return { openStation, openOfficialSite };
}

function getOfficialSitePlace(site: OfficialSiteRef): string {
  return [site.location.city, site.location.address].filter((part) => part !== null).join(PLACE_SEPARATOR);
}

function isPhoneChip(chip: IdChip, isNewCell: boolean): boolean {
  if (!CHANNEL_FIELDS.has(chip.field)) return true;
  return chip.kind === "changed" || (chip.kind === "added" && !isNewCell);
}

export function UnconfirmedMark() {
  const { t } = useTranslation("stations");
  const label = t("cells.cellNotConfirmed");

  return (
    <Tooltip>
      <TooltipTrigger render={<span className={UNCONFIRMED_MARK_CLASS} />}>
        <HugeiconsIcon icon={AlertCircleIcon} className="size-3" aria-hidden="true" />
        <span className="sr-only">{label}</span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function TechnologyText({ view }: RowViewProps) {
  const { i18n } = useTranslation();
  const bandLabel = getBandLabel(view.band, i18n.language);
  const bandCode = getBandCode(view.band);

  return (
    <span className="text-[11px] leading-4 whitespace-nowrap text-muted-foreground">
      <span className="font-bold text-foreground/70">{toRatType(view.facts.rat)}</span>
      {bandLabel === null ? null : <span className="font-mono font-medium tabular-nums"> {bandLabel}</span>}
      {bandCode === null ? null : <span> {bandCode}</span>}
    </span>
  );
}

export function OperatorName({ view }: RowViewProps) {
  const { operator } = view;
  const name = operator === undefined ? `${PLMN_LABEL} ${view.row.observed.plmn}` : operator.operator.name;

  return (
    <span title={name} className={cn(OPERATOR_NAME_CLASS, operator === undefined ? "text-muted-foreground" : null)}>
      {name}
    </span>
  );
}

export function OperatorCell({ view }: RowViewProps) {
  return (
    <>
      <div className="flex min-w-0 items-center gap-1.5">
        <BrandMark brand={view.operator?.brand} />
        <OperatorName view={view} />
      </div>
      <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
        <TechnologyText view={view} />
        {view.facts.isUnconfirmed ? <UnconfirmedMark /> : null}
      </div>
    </>
  );
}

function IdChipMark({ chip }: { chip: IdChip }) {
  const { t } = useTranslation("cellAnalyzer");

  if (chip.kind === "changed") {
    const storedTitle = t("stations:edit.marks.databaseValue");
    const fileTitle = t("table.fileValue");

    return (
      <span className={cn(CHIP_CLASS, "border border-amber-500/55 bg-amber-500/8 text-muted-foreground")}>
        {chip.label}
        <s title={storedTitle} className="font-mono tabular-nums text-amber-600 dark:text-amber-400">
          <span className="sr-only">{storedTitle}: </span>
          {chip.stored}
        </s>
        <span title={fileTitle} className={CHIP_VALUE_CLASS}>
          <span className="sr-only">{fileTitle}: </span>
          {chip.value}
        </span>
      </span>
    );
  }
  if (chip.kind === "added") {
    const title = t("table.missingInDatabase");

    return (
      <span title={title} className={cn(CHIP_CLASS, "border border-emerald-500/60 bg-emerald-500/6 text-muted-foreground")}>
        {chip.label}
        <span className={CHIP_VALUE_CLASS}>{chip.value}</span>
        <span className="sr-only">, {title}</span>
      </span>
    );
  }

  return (
    <span className={cn(CHIP_CLASS, "bg-muted text-muted-foreground")}>
      {chip.label}
      <span className={CHIP_VALUE_CLASS}>{chip.value}</span>
    </span>
  );
}

function IdChipLine({ chips }: { chips: readonly IdChip[] }) {
  return (
    <div className={CHIP_LINE_CLASS}>
      {chips.map((chip) => (
        <IdChipMark key={chip.field} chip={chip} />
      ))}
    </div>
  );
}

export function IdentifiersCell({ view, isSingleLine = false }: RowLineProps) {
  const { identity, values } = buildIdChips(view.row, view.result);
  const isNewCell = view.facts.kinds.includes("new");
  const lines = isSingleLine ? [[...identity, ...values].filter((chip) => isPhoneChip(chip, isNewCell))] : [identity, values];
  const shownLines = lines.filter((chips) => chips.length > 0);

  if (shownLines.length === 0) {
    return (
      <span className="text-xs leading-4">
        <EmptyValue />
      </span>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-[3px]">
      {shownLines.map((chips) => (
        <IdChipLine key={chips[0].field} chips={chips} />
      ))}
    </div>
  );
}

export function ResultBadge({ status }: { status: RowStatus }) {
  const { getStatusLabel } = useAnalyzerTexts();
  const badge = RESULT_BADGES[status];

  return (
    <span className={cn(RESULT_BADGE_CLASS, badge.className)}>
      <HugeiconsIcon icon={badge.icon} className="size-3" aria-hidden="true" />
      {getStatusLabel(status)}
    </span>
  );
}

export function StationIdButton({ station, className, onOpen }: StationIdButtonProps) {
  const { t } = useTranslation("cellAnalyzer");
  const label = t("table.openStationWindow", { siteId: station.siteId });

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={cn(STATION_ID_CLASS, LIST_ROW_LINK_CLASS, "min-w-0 cursor-pointer truncate", className)}
      onClick={() => onOpen(station)}
    >
      {station.siteId}
    </button>
  );
}

export function StationPlace({ stationView, hasCountryTile, hasRegion = true }: StationPlaceProps) {
  const location = stationView.station.location ?? null;
  const { regionName } = stationView;
  if (location === null) return <EmptyValue />;

  const { city, address } = location;
  const title = [city, address].filter((part) => part !== null).join(PLACE_SEPARATOR);

  return (
    <>
      {hasCountryTile ? <ListCountryTile countryCode={location.countryCode} /> : null}
      <span className="min-w-0 flex-1 truncate" title={title}>
        {city === null ? null : <span className="font-medium text-foreground">{city}</span>}
        {city === null && address === null ? <EmptyValue /> : null}
        {address === null ? null : (
          <span>
            {city === null ? null : LIST_DETAIL_SEPARATOR}
            {address}
          </span>
        )}
      </span>
      {hasRegion && regionName !== null ? (
        <span className={cn("max-w-[46%] flex-none truncate", ANALYZER_REGION_CLASS)} title={regionName}>
          {regionName}
        </span>
      ) : null}
    </>
  );
}

function RegisterSiteButton({ site, onOpen }: RegisterSiteProps) {
  return (
    <button type="button" className={REGISTER_SITE_CLASS} onClick={() => onOpen(site)}>
      {site.siteId}
    </button>
  );
}

export function RegisterHint({ sites, hasMoreSites = true, onOpen }: RegisterHintProps) {
  const { t } = useTranslation("cellAnalyzer");
  const [firstSite, ...otherSites] = sites;
  if (firstSite === undefined) return null;

  const place = getOfficialSitePlace(firstSite);

  return (
    <>
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex shrink-0 cursor-help" />}>
          <Badge variant="secondary" className={REGISTER_TAG_CLASS}>
            {REGISTER_TAG}
          </Badge>
          <span className="sr-only">{t("ukeMatch.hint")}</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-72">{t("ukeMatch.hint")}</TooltipContent>
      </Tooltip>
      <RegisterSiteButton site={firstSite} onOpen={onOpen} />
      <span className="min-w-0 flex-1 truncate" title={place}>
        {place}
      </span>
      {hasMoreSites && otherSites.length > 0 ? (
        <Popover>
          <PopoverTrigger aria-label={t("ukeMatch.moreCandidates")} render={<button type="button" className={MORE_SITES_CLASS} />}>
            +{otherSites.length}
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">{t("ukeMatch.candidates")}</p>
            <ul className="flex flex-col gap-1">
              {sites.map((site) => (
                <li key={site.id} className="flex min-w-0 items-center gap-1.5 text-xs leading-4">
                  <RegisterSiteButton site={site} onOpen={onOpen} />
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{getOfficialSitePlace(site)}</span>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      ) : null}
    </>
  );
}

function HostOperatorMark({ stationView }: { stationView: StationView }) {
  const { t } = useTranslation("cellAnalyzer");
  const { operator } = stationView;
  if (operator === undefined) return null;

  const label = t("table.hostStation", { operator: operator.operator.name });

  return (
    <span role="img" aria-label={label} title={label} className="-mr-0.5 inline-flex shrink-0">
      <BrandMark brand={operator.brand} />
    </span>
  );
}

export function MatchCell({ view, hasCountryTile, openers }: MatchCellProps) {
  const { t } = useTranslation("cellAnalyzer");
  const { stationView, officialSites } = view;
  const isShared = view.result?.isShared === true;
  const secondLineClass = cn("flex min-w-0 items-center gap-1.5", ANALYZER_SECOND_LINE_CLASS);

  return (
    <>
      <div className="flex min-w-0 items-center gap-2">
        <ResultBadge status={view.facts.status} />
        {stationView !== null && isShared ? <HostOperatorMark stationView={stationView} /> : null}
        {stationView === null ? null : <StationIdButton station={stationView.station} onOpen={openers.openStation} />}
      </div>
      {stationView === null ? null : (
        <div className={secondLineClass}>
          <StationPlace stationView={stationView} hasCountryTile={hasCountryTile} />
        </div>
      )}
      {stationView === null && officialSites.length > 0 ? (
        <div className={secondLineClass}>
          <RegisterHint sites={officialSites} onOpen={openers.openOfficialSite} />
        </div>
      ) : null}
      {stationView === null && officialSites.length === 0 ? (
        <div className={cn("truncate", ANALYZER_SECOND_LINE_CLASS)}>{t("table.noStation")}</div>
      ) : null}
    </>
  );
}

export function DifferencesCell({ view, isSingleLine = false }: RowLineProps) {
  const { t } = useTranslation("cellAnalyzer");
  const { getKindLabel, getKindHint, getBlockWord, getBlockHint } = useAnalyzerTexts();
  const { tick, kinds } = view.facts;

  if (!tick.canTick) {
    return (
      <div title={getBlockHint(tick.reason)} className={cn(ANALYZER_SECOND_LINE_CLASS, isSingleLine ? "truncate" : "line-clamp-2")}>
        {getBlockWord(tick.reason) ?? <EmptyValue />}
      </div>
    );
  }
  if (tick.action === "confirm") {
    return (
      <div className={isSingleLine ? "flex min-w-0 items-center gap-2.5" : "min-w-0"}>
        <div title={getBlockHint("noDifferences")} className={cn("truncate", ANALYZER_SECOND_LINE_CLASS)}>
          {t("diff.none")}
        </div>
        <div className="flex shrink-0 items-center gap-1 text-xs leading-4 font-medium text-primary">
          <HugeiconsIcon icon={Tick02Icon} className="size-3" aria-hidden="true" />
          {t("diff.confirm")}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex min-w-0 gap-x-1.5 overflow-hidden text-xs leading-4", isSingleLine ? null : "max-h-8 flex-wrap")}>
      {kinds.map((kind, position) => (
        <Fragment key={kind}>
          {position === 0 ? null : (
            <>
              <span aria-hidden="true" className="text-muted-foreground">
                ·
              </span>
              <span className="sr-only">, </span>
            </>
          )}
          <span title={getKindHint(kind)} className="whitespace-nowrap">
            {getKindLabel(kind)}
          </span>
        </Fragment>
      ))}
    </div>
  );
}

export function DescriptionCell({ description }: { description: string }) {
  const { t } = useTranslation("cellAnalyzer");

  if (description === "") {
    return (
      <div className="text-center text-xs leading-4 @min-[938px]:text-left">
        <EmptyValue />
      </div>
    );
  }

  return (
    <>
      <div className={ANALYZER_DESCRIPTION_TEXT_CLASS}>
        <p title={description} className="line-clamp-2 text-xs leading-4 text-foreground/80">
          {description}
        </p>
      </div>
      <div className={ANALYZER_DESCRIPTION_ICON_CLASS}>
        <ListIconMark icon={Note01Icon} label={t("table.sourceDescription")} tooltip={description} />
      </div>
    </>
  );
}

export function RowTick({ view, isTicked, onToggle }: RowTickProps) {
  const { t } = useTranslation("cellAnalyzer");
  const { getBlockHint } = useAnalyzerTexts();
  const { index, facts } = view;
  const label = t("selection.selectRow", { number: index + 1 });

  if (facts.tick.canTick) {
    return <Checkbox checked={isTicked} aria-label={label} className="cursor-pointer" onCheckedChange={(isChecked) => onToggle(index, isChecked)} />;
  }

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex cursor-not-allowed" />}>
        <Checkbox checked={false} disabled aria-label={label} className="pointer-events-none" />
      </TooltipTrigger>
      <TooltipContent align="start" className="max-w-72">
        {getBlockHint(facts.tick.reason)}
      </TooltipContent>
    </Tooltip>
  );
}
