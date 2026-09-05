import { createFileRoute } from "@tanstack/react-router";

import Explorer from "@/components/nsg/explorer";
import { clearNsgSession, importNsgFile, useNsgSession } from "@/lib/nsg/session";

function NsgPage() {
  const { log, progress, error, status } = useNsgSession();

  return (
    <Explorer
      log={log}
      progress={progress}
      error={error}
      isParsing={status === "parsing"}
      onSelectFile={importNsgFile}
      onCancel={clearNsgSession}
      onClear={clearNsgSession}
    />
  );
}

export const Route = createFileRoute("/_layout/nsg-explorer")({
  component: NsgPage,
  staticData: {
    mainClassName: "overflow-hidden max-md:pb-0",
    titleKey: "items.nsg",
    i18nNamespace: "nav",
    breadcrumbs: [{ titleKey: "sections.stations", i18nNamespace: "nav", path: "/" }],
  },
});
