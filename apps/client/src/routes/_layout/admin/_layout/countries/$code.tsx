import { createFileRoute } from "@tanstack/react-router";

import { CountryPage } from "@/features/admin/reference/components/country/countryPage";

function AdminCountryPage() {
  const { code } = Route.useParams();

  return <CountryPage code={code} />;
}

export const Route = createFileRoute("/_layout/admin/_layout/countries/$code")({
  component: AdminCountryPage,
  staticData: {
    titleKey: "reference.countries.detailTitle",
    i18nNamespace: "admin",
    mainClassName: "overflow-hidden max-md:pb-0",
    breadcrumbs: [
      { titleKey: "sections.reference", i18nNamespace: "nav" },
      { titleKey: "items.countries", path: "/admin/countries", i18nNamespace: "nav" },
    ],
    allowedRoles: ["admin", "editor"],
  },
});
