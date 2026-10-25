import { createFileRoute } from "@tanstack/react-router";

import { EvidencePage } from "@/features/admin/observation-flags/evidence/evidencePage";
import { isRecordId } from "@/lib/apiValues";

type EvidenceSearch = {
  flag?: number;
};

function readRecordId(value: unknown): number | undefined {
  const id = Number(value);
  return isRecordId(id) ? id : undefined;
}

function parseEvidenceSearch(search: Record<string, unknown>): EvidenceSearch {
  return { flag: readRecordId(search.flag) };
}

function EvidenceRoute() {
  const { id } = Route.useParams();
  const { flag } = Route.useSearch();

  return <EvidencePage observedSiteId={readRecordId(id) ?? null} flagId={flag ?? null} />;
}

export const Route = createFileRoute("/_layout/admin/_layout/observation-flags/sites/$id/")({
  validateSearch: parseEvidenceSearch,
  component: EvidenceRoute,
  staticData: {
    mainClassName: "overflow-hidden max-md:pb-0",
    titleKey: "observationFlags.evidence.title",
    i18nNamespace: "admin",
    breadcrumbs: [
      { titleKey: "sections.admin", i18nNamespace: "nav" },
      { titleKey: "items.observationFlags", path: "/admin/observation-flags", i18nNamespace: "nav" },
    ],
    allowedRoles: ["admin", "editor"],
  },
});
