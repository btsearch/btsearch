import { Building03Icon } from "@hugeicons/core-free-icons";
import { createContext, useContext } from "react";
import { useTranslation } from "react-i18next";

import type { Brand } from "../../types";
import { BrandTile } from "../shared/brandTile";
import { ReferenceIconTile } from "../shared/referenceCards";
import { CountValue, MONO_TEXT_CLASS } from "../shared/values";
import {
  type LinkedRecord,
  type OwnerLocationCount,
  type OwnerLocationCounts,
  type OwnerOperator,
  getOwnerLocationCount,
} from "./useStructureOwnerListRows";
import { type BrandLook, BrandMark } from "@/components/cellular/brandMark";
import { CountryCodeTile } from "@/components/ui/countryCodeTile";
import { EmptyValue } from "@/components/ui/emptyValue";
import { Skeleton } from "@/components/ui/skeleton";
import { getCountryName } from "@/lib/geo/countryName";

type MarkedNameProps = {
  look: BrandLook | null;
  name: string;
};

export const OwnerLocationCountsContext = createContext<OwnerLocationCounts | null>(null);

export function useOwnerLocationCount(ownerId: number): OwnerLocationCount {
  const locationCounts = useContext(OwnerLocationCountsContext);
  if (locationCounts === null) throw new Error("The structure owner list must render inside OwnerLocationCountsContext");
  return getOwnerLocationCount(locationCounts, ownerId);
}

function MarkedName({ look, name }: MarkedNameProps) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <BrandMark brand={look} size={16} />
      <span className="truncate">{name}</span>
    </span>
  );
}

export function OwnerTile({ brand }: { brand: LinkedRecord<Brand> }) {
  if (brand.state === "loading") return <Skeleton className="size-8 shrink-0 rounded-lg" />;
  if (brand.state === "ready") return <BrandTile brand={brand.record} size={32} />;
  return <ReferenceIconTile icon={Building03Icon} />;
}

export function OwnerCountry({ countryCode }: { countryCode: string | null }) {
  const { t, i18n } = useTranslation("admin");

  if (countryCode === null) return <span className="text-muted-foreground">{t("reference.owners.noCountry")}</span>;

  return (
    <span className="flex min-w-0 items-center gap-2">
      <CountryCodeTile code={countryCode} size="sm" />
      <span className="truncate">{getCountryName(countryCode, i18n.language)}</span>
    </span>
  );
}

export function OwnerBrand({ brand }: { brand: LinkedRecord<Brand> }) {
  if (brand.state === "loading") return <Skeleton className="h-4 w-20" />;
  if (brand.state === "none") return <EmptyValue />;
  return <MarkedName look={brand.record} name={brand.record.name} />;
}

export function OwnerOperatorName({ operator }: { operator: LinkedRecord<OwnerOperator> }) {
  if (operator.state === "loading") return <Skeleton className="h-4 w-20" />;
  if (operator.state === "none") return <EmptyValue />;
  return <MarkedName look={operator.record.brand} name={operator.record.operator.name} />;
}

export function OwnerLocationCountValue({ ownerId }: { ownerId: number }) {
  const locations = useOwnerLocationCount(ownerId);

  return (
    <span className={MONO_TEXT_CLASS}>
      <CountValue count={locations} skeletonClassName="h-4 w-10" />
    </span>
  );
}
