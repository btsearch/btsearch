import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { buildStaticPageHead } from "@/lib/seo";

const REMARK_PLUGINS = [remarkGfm];

function ChangelogPage() {
  const { t } = useTranslation();

  const {
    data: markdown,
    error,
    isLoading,
  } = useQuery({
    queryKey: ["changelog"],
    queryFn: async () => {
      const res = await fetch("/CHANGELOG.md");
      if (!res.ok) throw new Error(res.statusText);
      return res.text();
    },
  });

  return (
    <main className="flex-1 overflow-y-auto p-4">
      <div className="max-w-4xl space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">{t("changelog.title", "Changelog")}</h1>
        </div>

        {error && <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error.message}</div>}

        {markdown && !error && (
          <article className="space-y-4 text-sm [&_h1]:text-xl [&_h1]:font-bold [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:text-base [&_h3]:font-semibold [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-6 [&_ol]:pl-6 [&_p]:leading-relaxed [&_a]:text-primary [&_a]:underline [&_a:hover]:opacity-80 [&_hr]:border-border [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-4">
            <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{markdown}</ReactMarkdown>
          </article>
        )}

        {isLoading && <div className="flex items-center justify-center py-12 text-muted-foreground">{t("changelog.loading", "Loading...")}</div>}
      </div>
    </main>
  );
}

export const Route = createFileRoute("/_layout/changelog")({
  component: ChangelogPage,
  head: () => buildStaticPageHead("/changelog"),
  staticData: {
    titleKey: "items.changelog",
    i18nNamespace: "nav",
  },
});
