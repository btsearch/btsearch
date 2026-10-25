import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { UploadsPage } from "@/features/admin/measurements/uploads/uploadsPage";
import { type UploadsCriteria, parseUploadsSearch, readUploadsCriteria, toUploadsSearch } from "@/features/admin/measurements/uploads/uploadsSearch";

function AdminUploadsPage() {
  const navigate = useNavigate();
  const criteria = readUploadsCriteria(Route.useSearch());

  function changeCriteria(changes: Partial<UploadsCriteria>) {
    void navigate({
      from: Route.fullPath,
      search: (current) => toUploadsSearch({ ...readUploadsCriteria(current), ...changes }),
      replace: true,
    });
  }

  return <UploadsPage criteria={criteria} onCriteriaChange={changeCriteria} />;
}

export const Route = createFileRoute("/_layout/admin/_layout/measurements/uploads")({
  validateSearch: parseUploadsSearch,
  component: AdminUploadsPage,
  staticData: {
    titleKey: "measurements.tabs.uploads",
    i18nNamespace: "admin",
    breadcrumbs: [
      { titleKey: "sections.admin", i18nNamespace: "nav" },
      { titleKey: "items.measurements", path: "/admin/measurements", i18nNamespace: "nav" },
    ],
  },
});
