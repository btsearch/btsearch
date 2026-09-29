import { createFileRoute } from "@tanstack/react-router";

import { RouteNotFound } from "@/components/app/errorScreens";

export const Route = createFileRoute("/_layout/$")({
  component: RouteNotFound,
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  staticData: {
    titleKey: "error.notFoundTitle",
    i18nNamespace: "common",
  },
});
