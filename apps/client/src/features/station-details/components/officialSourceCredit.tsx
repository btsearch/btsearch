import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { OfficialSource } from "@openbts/shared/contract";
import { useTranslation } from "react-i18next";

import { OfficialSourceLogo } from "./officialSourceLogo";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type OfficialSourceCreditProps = {
  sourceKey: string;
  source: OfficialSource | null;
};

export function OfficialSourceCredit({ sourceKey, source }: OfficialSourceCreditProps) {
  const { t } = useTranslation("stationDetails");
  const shortName = source?.shortName ?? "";

  return (
    <Tooltip>
      <TooltipTrigger className="cursor-help opacity-60 transition-opacity hover:opacity-100">
        <OfficialSourceLogo source={{ key: sourceKey, shortName }} className="h-3" />
        <span className="sr-only">{shortName}</span>
      </TooltipTrigger>
      {source === null ? null : (
        <TooltipContent>{t("permits.sourceAttribution", { authority: source.authority, source: source.shortName })}</TooltipContent>
      )}
    </Tooltip>
  );
}

export function OfficialSourceLine({ source }: { source: OfficialSource }) {
  const { t } = useTranslation("stationDetails");
  const homepageHost = new URL(source.homepageUrl).hostname.replace(/^www\./, "");

  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
      <span>{t("permits.sourceAttribution", { authority: source.authority, source: source.shortName })}</span>
      <span aria-hidden="true">·</span>
      <span>{source.license}</span>
      <span aria-hidden="true">·</span>
      <a
        href={source.homepageUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-0.5 text-primary underline decoration-muted-foreground/40 underline-offset-2 transition-colors hover:decoration-current"
      >
        {homepageHost}
        <HugeiconsIcon icon={ArrowUpRight01Icon} className="size-3" aria-hidden="true" />
      </a>
    </p>
  );
}
