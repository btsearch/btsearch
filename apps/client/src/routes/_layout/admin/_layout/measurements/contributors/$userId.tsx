import { createFileRoute } from "@tanstack/react-router";

import { PersonNotFound, PersonPage } from "@/features/admin/measurements/person/personPage";
import { parseUserId } from "@/features/admin/users/utils/userId";

function AdminContributorPage() {
  const userId = parseUserId(Route.useParams().userId);

  if (userId === undefined) return <PersonNotFound />;
  return <PersonPage key={userId} userId={userId} />;
}

export const Route = createFileRoute("/_layout/admin/_layout/measurements/contributors/$userId")({
  component: AdminContributorPage,
  staticData: {
    titleKey: "measurements.person.title",
    i18nNamespace: "admin",
    mainClassName: "overflow-hidden max-md:pb-0",
    breadcrumbs: [
      { titleKey: "sections.admin", i18nNamespace: "nav" },
      { titleKey: "items.measurements", path: "/admin/measurements", i18nNamespace: "nav" },
      { titleKey: "measurements.tabs.contributors", path: "/admin/measurements/contributors", i18nNamespace: "admin" },
    ],
  },
});
