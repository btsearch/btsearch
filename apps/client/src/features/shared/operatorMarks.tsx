import type { Brand, Operator } from "@openbts/shared/contract";
import type { ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";

import { findOperator } from "./lookups";
import { findOperatorForPlmn } from "./operatorBrands";
import { type BrandLook, BrandMark } from "@/components/cellular/brandMark";
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { MocnLink } from "@/features/station-details/components/sharingLinks";
import { getOperatorBrand } from "@/features/station-details/station/utils/brands";
import { cn } from "@/lib/utils";

export type OperatorMark = { key: string; name: string; code: string | null; brand: BrandLook | null };

type OperatorMarksProps = {
  marks: readonly OperatorMark[];
  title: string;
  description: ReactNode;
  size?: number;
  isNested?: boolean;
  isStatic?: boolean;
  className?: string;
};

type StationGuestMarksProps = Pick<OperatorMarksProps, "marks" | "size" | "isNested" | "isStatic" | "className">;

const HOVER_DELAY_MS = 300;
const LIST_MARK_SIZE = 16;

export function formatNetworkName(operator: Operator, code: string): string {
  return operator.plmns.length > 1 ? `${operator.name} ${code}` : operator.name;
}

export function getNetworkName(code: string, operators: readonly Operator[] | undefined): string {
  const operator = findOperatorForPlmn(operators, code);
  return operator === null ? code : formatNetworkName(operator, code);
}

export function indexNetworkNames(operators: readonly Operator[] | undefined): Map<string, string> {
  const names = new Map<string, string>();
  for (const operator of operators ?? []) {
    for (const { plmn } of operator.plmns) names.set(plmn, formatNetworkName(operator, plmn));
  }
  return names;
}

export function listNetworkMarks(
  codes: readonly string[],
  operators: readonly Operator[] | undefined,
  brands: readonly Brand[] | undefined,
): OperatorMark[] {
  return codes.map((code) => {
    const operator = findOperatorForPlmn(operators, code);
    return operator === null
      ? { key: code, name: code, code: null, brand: null }
      : { key: code, name: operator.name, code, brand: getOperatorBrand(operator, brands) };
  });
}

export function listOperatorMarks(
  operatorIds: readonly number[],
  operators: readonly Operator[] | undefined,
  brands: readonly Brand[] | undefined,
): OperatorMark[] {
  return operatorIds.flatMap((operatorId) => {
    const operator = findOperator(operators, operatorId);
    return operator === null
      ? []
      : [{ key: String(operatorId), name: operator.name, code: operator.primaryPlmn, brand: getOperatorBrand(operator, brands) }];
  });
}

function describeMark(mark: OperatorMark): string {
  return mark.code === null ? mark.name : `${mark.name} (${mark.code})`;
}

export function OperatorMarks({ marks, title, description, size = 16, isNested = false, isStatic = false, className }: OperatorMarksProps) {
  if (marks.length === 0) return null;

  const label = `${title}: ${marks.map(describeMark).join(", ")}`;
  const brandMarks = marks.map((mark) => <BrandMark key={mark.key} brand={mark.brand} size={size} />);
  if (isStatic) {
    return (
      <span role="img" aria-label={label} title={label} className={cn("inline-flex shrink-0 items-center gap-1", className)}>
        {brandMarks}
      </span>
    );
  }

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={HOVER_DELAY_MS}
        nativeButton={false}
        render={<span />}
        tabIndex={isNested ? -1 : 0}
        aria-label={label}
        onClick={(event) => event.stopPropagation()}
        className={cn(
          "inline-flex shrink-0 cursor-help items-center gap-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        {brandMarks}
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-64 gap-2 p-2.5">
        <PopoverTitle className="text-xs font-semibold">{title}</PopoverTitle>
        <PopoverDescription className="text-[11px] leading-snug">{description}</PopoverDescription>
        <ul className="flex flex-col gap-1.5">
          {marks.map((mark) => (
            <li key={mark.key} className="flex min-w-0 items-center gap-1.5 text-xs leading-4">
              <BrandMark brand={mark.brand} size={LIST_MARK_SIZE} />
              <span className="min-w-0 truncate font-medium text-foreground">{mark.name}</span>
              {mark.code === null ? null : <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{mark.code}</span>}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export function StationGuestMarks({ marks, size, isNested, isStatic, className }: StationGuestMarksProps) {
  const { t } = useTranslation("common");

  return (
    <OperatorMarks
      marks={marks}
      title={t("sharedNetworks.stationTitle")}
      description={<Trans t={t} i18nKey="sharedNetworks.stationHint" components={{ mocnLink: <MocnLink /> }} />}
      size={size}
      isNested={isNested}
      isStatic={isStatic}
      className={className}
    />
  );
}
