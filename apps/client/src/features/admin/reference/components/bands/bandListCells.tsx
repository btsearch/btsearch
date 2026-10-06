import { useTranslation } from "react-i18next";

import type { Band } from "../../types";
import { formatBandRange, getGenerationRat } from "../../utils/bands";
import { type Loadable, isZeroCount } from "../shared/loadable";
import { CountValue, MONO_TEXT_CLASS } from "../shared/values";
import { Badge } from "@/components/ui/badge";
import { CountryCodeTile } from "@/components/ui/countryCodeTile";
import { EmptyValue } from "@/components/ui/emptyValue";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RatGenerationLabel } from "@/features/shared/RatGenerationLabel";
import { getCountryName } from "@/lib/geo/countryName";
import { cn } from "@/lib/utils";

const MAX_PLAN_TILES = 4;

export function BandIdentity({ band }: { band: Band }) {
  const { t } = useTranslation("admin");

  return (
    <div className="flex min-w-0 items-center gap-2">
      <RatGenerationLabel rat={getGenerationRat(band.rat)} />
      <span className="truncate font-medium">{band.name}</span>
      {band.variant === "railway" ? <Badge variant="secondary">{t("admin:reference.bands.variants.railway")}</Badge> : null}
    </div>
  );
}

export function BandCodeChip({ code }: { code: string }) {
  return <span className="inline-flex h-5.5 shrink-0 items-center rounded-md bg-muted px-1.5 font-mono text-xs tabular-nums">{code}</span>;
}

export function BandCode({ code }: { code: string | null }) {
  const { t } = useTranslation("admin");

  if (code === null) return <span className="text-muted-foreground">{t("admin:reference.bands.code.without")}</span>;
  return <BandCodeChip code={code} />;
}

export function BandDuplex({ duplex }: { duplex: Band["duplex"] }) {
  return duplex === null ? <EmptyValue /> : duplex.toUpperCase();
}

export function BandRange({ range }: { range: Band["downlinkKhz"] }) {
  const text = formatBandRange(range);
  return text === null ? <EmptyValue /> : <span className={MONO_TEXT_CLASS}>{text}</span>;
}

export function BandPlanCountries({ detail }: { detail: Loadable<readonly string[]> }) {
  const { i18n } = useTranslation();

  if (detail.state === "loading") return <Skeleton aria-hidden="true" className="h-5.5 w-12 rounded-md" />;
  if (detail.state === "failed" || detail.value.length === 0) return <EmptyValue />;

  const countryCodes = detail.value;
  const shownCount = countryCodes.length > MAX_PLAN_TILES ? MAX_PLAN_TILES - 1 : countryCodes.length;
  const hiddenCountryCodes = countryCodes.slice(shownCount);

  return (
    <div className="flex items-center gap-1">
      {countryCodes.slice(0, shownCount).map((code) => (
        <CountryCodeTile key={code} code={code} size="sm" label={getCountryName(code, i18n.language)} />
      ))}
      {hiddenCountryCodes.length > 0 ? (
        <Tooltip>
          <TooltipTrigger render={<span />} className="inline-flex shrink-0">
            <Badge variant="secondary">+{hiddenCountryCodes.length}</Badge>
          </TooltipTrigger>
          <TooltipContent>{hiddenCountryCodes.map((code) => getCountryName(code, i18n.language)).join(", ")}</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}

export function BandCellCount({ detail }: { detail: Loadable<number> }) {
  return (
    <span className={cn(MONO_TEXT_CLASS, isZeroCount(detail) && "text-muted-foreground")}>
      <CountValue count={detail} skeletonClassName="h-4 w-12" />
    </span>
  );
}
