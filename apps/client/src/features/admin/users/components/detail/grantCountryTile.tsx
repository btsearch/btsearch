import { CountryCodeTile } from "@/components/ui/countryCodeTile";

export function GrantCountryTile({ code }: { code: string }) {
  return <CountryCodeTile code={code} size="md" />;
}
