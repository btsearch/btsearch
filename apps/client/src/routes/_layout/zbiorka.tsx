import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { ErrorState, StaleDataNotice } from "@/components/ui/error-state";
import { Spinner } from "@/components/ui/spinner";

const REMARK_PLUGINS = [remarkGfm];

function ZbiorkaPage() {
  const {
    data: markdown,
    isError,
    isLoading,
    isFetching,
    isRefetchError,
    refetch,
  } = useQuery({
    queryKey: ["changelog"],
    queryFn: async () => {
      const res = await fetch("/ZBIORKA.md");
      if (!res.ok) throw new Error(res.statusText);
      return res.text();
    },
  });

  return (
    <main className="flex-1 overflow-y-auto p-4">
      <div className="max-w-4xl space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Zbiórka</h1>
        </div>

        {isError && !markdown ? <ErrorState onRetry={() => refetch()} isRetrying={isFetching} /> : null}

        {isRefetchError ? <StaleDataNotice onRetry={() => refetch()} isRetrying={isFetching} /> : null}

        {markdown ? (
          <article className="space-y-4 text-sm [&_h1]:text-xl [&_h1]:font-bold [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:text-base [&_h3]:font-semibold [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-6 [&_ol]:pl-6 [&_p]:leading-relaxed [&_a]:text-primary [&_a]:underline [&_a:hover]:opacity-80 [&_hr]:border-border [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-4">
            <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{markdown}</ReactMarkdown>
          </article>
        ) : null}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner className="size-5" />
          </div>
        ) : null}
      </div>
    </main>
  );
}

export const Route = createFileRoute("/_layout/zbiorka")({
  component: ZbiorkaPage,
  staticData: {
    titleKey: "items.fundraiser",
    i18nNamespace: "nav",
  },
});
