import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { useSiteSources } from "@/features/official/queries";

export function RegisterSources({ countryCode }: { countryCode: string }) {
  const { t } = useTranslation("statistics");
  const sources = useSiteSources(countryCode);
  if (sources.length === 0) return null;

  return (
    <footer className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <span>{t("register.source")}</span>
      {sources.map((source) => (
        <a
          key={source.key}
          href={source.homepageUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 text-primary underline decoration-muted-foreground/40 underline-offset-2 transition-colors hover:decoration-current"
        >
          {`${source.authority} (${source.shortName})`}
          <HugeiconsIcon icon={ArrowUpRight01Icon} className="size-3" aria-hidden="true" />
        </a>
      ))}
    </footer>
  );
}
