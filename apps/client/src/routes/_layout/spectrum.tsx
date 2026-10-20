import { createFileRoute } from "@tanstack/react-router";

import { SpectrumPage } from "@/features/spectrum/components/spectrumPage";
import { isCountryCode } from "@/lib/apiValues";
import { buildStaticPageHead } from "@/lib/seo";

type SpectrumSearch = { country?: string };

function SpectrumRoute() {
  const { country } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <SpectrumPage
      requestedCountryCode={country ?? null}
      onCountryChange={(countryCode) => void navigate({ search: { country: countryCode }, replace: true })}
    />
  );
}

export const Route = createFileRoute("/_layout/spectrum")({
  component: SpectrumRoute,
  validateSearch: (search: Record<string, unknown>): SpectrumSearch => (isCountryCode(search.country) ? { country: search.country } : {}),
  head: () => buildStaticPageHead("/spectrum"),
  staticData: {
    titleKey: "items.spectrum",
    i18nNamespace: "nav",
  },
});
