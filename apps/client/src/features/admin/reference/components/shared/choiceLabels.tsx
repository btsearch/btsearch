import { useTranslation } from "react-i18next";

import type { Brand } from "../../types";
import { type BrandLook, BrandMark } from "@/components/cellular/brandMark";
import { CountryCodeTile } from "@/components/ui/countryCodeTile";
import { getCountryName } from "@/lib/geo/countryName";

type MarkedChoiceLabelProps = {
  look: BrandLook | null;
  name: string;
};

export function CountryChoiceLabel({ countryCode }: { countryCode: string }) {
  const { i18n } = useTranslation();

  return (
    <>
      <CountryCodeTile code={countryCode} size="xs" />
      {getCountryName(countryCode, i18n.language)}
    </>
  );
}

export function MarkedChoiceLabel({ look, name }: MarkedChoiceLabelProps) {
  return (
    <>
      <BrandMark brand={look} size={16} />
      {name}
    </>
  );
}

export function BrandChoiceLabel({ brand }: { brand: Brand | null }) {
  const { t } = useTranslation("admin");

  if (brand === null) return t("reference.operator.noBrand");
  return <MarkedChoiceLabel look={brand} name={brand.name} />;
}
