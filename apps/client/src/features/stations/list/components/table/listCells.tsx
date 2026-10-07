import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type { ReactElement, ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { CountryCodeTile } from "@/components/ui/countryCodeTile";
import { EmptyValue } from "@/components/ui/emptyValue";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { HighlightedText } from "@/features/shared/HighlightedText";
import { StructureTypeIcon } from "@/features/station-details/station/components/structureTypeIcon";
import type { ListRowStructure } from "@/features/stations/list/data/listStructures";
import { formatFullDate, formatShortDate } from "@/lib/format";
import { getCountryName } from "@/lib/geo/countryName";
import { cn } from "@/lib/utils";

type ListIconMarkProps = {
  icon: IconSvgElement;
  label: string;
  tooltip?: string;
};

type ListPlaceCellProps = {
  countryCode: string | null;
  city: string | null;
  cityMark?: string;
  address: string | null;
  addressMark?: string;
  regionName: string | null;
  cityAside?: ReactNode;
  addressAside?: ReactElement;
  lineClassName?: string;
};

type ListStructureCellProps = {
  structure: ListRowStructure;
  isFolding?: boolean;
};

type ListDateProps = {
  value: string;
  label: string;
  locale: string;
  className: string;
};

type ListDatesCellProps = {
  updatedAt: string;
  createdAt: string;
};

const PLACE_LINE_CLASS = "flex max-w-120 min-w-0 items-center";
const SECOND_LINE_CLASS = "text-xs leading-4 text-muted-foreground";
const STRUCTURE_CELL_CLASS = "flex min-w-0 items-center gap-1.5";
const UPDATED_DATE_CLASS = "block text-right text-[13px] leading-5 whitespace-nowrap tabular-nums";
const CREATED_DATE_CLASS = "block truncate text-right text-[11.5px] leading-4 text-muted-foreground tabular-nums";
const CARD_DATE_CLASS = "ml-auto shrink-0 text-xs leading-4 text-muted-foreground tabular-nums";

export const LIST_DETAIL_SEPARATOR = " · ";
export const LIST_CUT_FIRST_CLASS = "shrink-[999999]";

function joinDetails(details: readonly (string | null)[]): string {
  return details.filter((detail) => detail !== null).join(LIST_DETAIL_SEPARATOR);
}

export function ListCell({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div role="cell" className={cn("min-w-0", className)}>
      {children}
    </div>
  );
}

export function ListIconMark({ icon, label, tooltip }: ListIconMarkProps) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex shrink-0 cursor-help text-muted-foreground" />}>
        <HugeiconsIcon icon={icon} className="size-3.25" aria-hidden="true" />
        <span className="sr-only">{label}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-72">{tooltip ?? label}</TooltipContent>
    </Tooltip>
  );
}

export function ListCountryTile({ countryCode }: { countryCode: string }) {
  const { i18n } = useTranslation();

  return <CountryCodeTile code={countryCode} size="xs" label={getCountryName(countryCode, i18n.language)} />;
}

export function ListPlaceCell({
  countryCode,
  city,
  cityMark = "",
  address,
  addressMark = "",
  regionName,
  cityAside,
  addressAside,
  lineClassName,
}: ListPlaceCellProps) {
  const isAddressGrowing = addressAside === undefined;

  return (
    <>
      <div className={cn(PLACE_LINE_CLASS, "gap-1.5", lineClassName)}>
        {countryCode === null ? null : <ListCountryTile countryCode={countryCode} />}
        <span className="truncate text-sm leading-5 font-medium" title={city ?? undefined}>
          {city === null ? <EmptyValue /> : <HighlightedText text={city} query={cityMark} />}
        </span>
        {cityAside}
      </div>
      <div className={cn(PLACE_LINE_CLASS, "min-h-4 gap-2", SECOND_LINE_CLASS, lineClassName)}>
        {isAddressGrowing || address !== null ? (
          <span className={cn("min-w-0 truncate", isAddressGrowing ? "flex-1" : LIST_CUT_FIRST_CLASS)} title={address ?? undefined}>
            {address === null ? null : <HighlightedText text={address} query={addressMark} />}
          </span>
        ) : null}
        {addressAside}
        {regionName === null ? null : (
          <span className={cn("max-w-[60%] flex-none truncate", isAddressGrowing ? null : "ml-auto")} title={regionName}>
            {regionName}
          </span>
        )}
      </div>
    </>
  );
}

export function ListStructureCell({ structure, isFolding = false }: ListStructureCellProps) {
  const { t } = useTranslation("common");
  const typeName = structure.typeKey === null ? null : t(structure.typeKey);
  const firstLine = typeName ?? structure.textWithoutType;
  const summary = joinDetails([typeName, ...structure.tooltipDetails]);
  const content = (
    <>
      {structure.type === null ? null : <StructureTypeIcon type={structure.type} className="size-4.5 shrink-0 text-foreground/80" />}
      {structure.type === null && isFolding ? (
        <span className="text-xs leading-4 @min-[870px]:hidden">
          <EmptyValue />
        </span>
      ) : null}
      {isFolding && summary !== "" ? <span className="sr-only @min-[870px]:hidden">{summary}</span> : null}
      <span className={cn("min-w-0 flex-1", isFolding ? "hidden @min-[870px]:block" : null)}>
        <span className="block truncate text-[13px] leading-5">{firstLine ?? <EmptyValue />}</span>
        {structure.secondLine === null ? null : <span className={cn("block truncate", SECOND_LINE_CLASS)}>{structure.secondLine}</span>}
      </span>
    </>
  );

  if (summary === "") return <span className={STRUCTURE_CELL_CLASS}>{content}</span>;

  return (
    <Tooltip>
      <TooltipTrigger render={<span className={STRUCTURE_CELL_CLASS} />}>{content}</TooltipTrigger>
      <TooltipContent className="max-w-72">{summary}</TooltipContent>
    </Tooltip>
  );
}

export function ListStructureLine({ structure }: { structure: ListRowStructure }) {
  const { t } = useTranslation("common");
  const typeName = structure.typeKey === null ? null : t(structure.typeKey);
  const text = typeName === null ? structure.textWithoutType : joinDetails([typeName, structure.secondLine]);

  return (
    <span className="flex min-w-0 flex-1 items-center gap-1.5">
      {structure.type === null ? null : <StructureTypeIcon type={structure.type} className="size-3.5 shrink-0" />}
      {text === null ? null : <span className="truncate">{text}</span>}
    </span>
  );
}

function ListDate({ value, label, locale, className }: ListDateProps) {
  return (
    <time dateTime={value} title={formatFullDate(value, locale)} className={className}>
      <span className="sr-only">{label}: </span>
      {formatShortDate(value, locale)}
    </time>
  );
}

export function ListDatesCell({ updatedAt, createdAt }: ListDatesCellProps) {
  const { t, i18n } = useTranslation("common");

  return (
    <>
      <ListDate value={updatedAt} label={t("labels.updated")} locale={i18n.language} className={UPDATED_DATE_CLASS} />
      <ListDate value={createdAt} label={t("labels.added")} locale={i18n.language} className={CREATED_DATE_CLASS} />
    </>
  );
}

export function ListCardDate({ updatedAt }: { updatedAt: string }) {
  const { t, i18n } = useTranslation("common");

  return <ListDate value={updatedAt} label={t("labels.updated")} locale={i18n.language} className={CARD_DATE_CLASS} />;
}
