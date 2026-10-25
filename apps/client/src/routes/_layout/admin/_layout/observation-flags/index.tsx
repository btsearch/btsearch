import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { FlagsQueuePage } from "@/features/admin/observation-flags/queue/queuePage";
import {
  type FlagsQueueCriteria,
  parseFlagsQueueSearch,
  readFlagsQueueCriteria,
  toFlagsQueueSearch,
} from "@/features/admin/observation-flags/queue/queueSearch";

function FlagsQueueRoutePage() {
  const navigate = useNavigate();
  const search = Route.useSearch();

  function changeCriteria(changes: Partial<FlagsQueueCriteria>) {
    void navigate({
      from: Route.fullPath,
      search: (current) => toFlagsQueueSearch({ ...readFlagsQueueCriteria(current), ...changes }),
      replace: true,
    });
  }

  return <FlagsQueuePage criteria={readFlagsQueueCriteria(search)} onCriteriaChange={changeCriteria} />;
}

export const Route = createFileRoute("/_layout/admin/_layout/observation-flags/")({
  validateSearch: parseFlagsQueueSearch,
  component: FlagsQueueRoutePage,
  staticData: {
    titleKey: "items.observationFlags",
    i18nNamespace: "nav",
    mainClassName: "overflow-hidden max-md:pb-0",
    breadcrumbs: [{ titleKey: "sections.admin", i18nNamespace: "nav" }],
    allowedRoles: ["admin", "editor"],
  },
});
