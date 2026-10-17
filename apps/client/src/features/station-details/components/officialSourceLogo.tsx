import type { OfficialSource } from "@openbts/shared/contract";
import type { ReactNode } from "react";

import { UKELogo } from "./ukeLogo";
import { cn } from "@/lib/utils";

type OfficialSourceLogoProps = {
  source: Pick<OfficialSource, "key" | "shortName">;
  className?: string;
};

const SOURCE_LOGOS: ReadonlyMap<string, (className: string | undefined) => ReactNode> = new Map([
  ["pl-uke", (className: string | undefined) => <UKELogo className={className} />],
]);

export function OfficialSourceLogo({ source, className }: OfficialSourceLogoProps) {
  const renderLogo = SOURCE_LOGOS.get(source.key);
  if (renderLogo === undefined) {
    return (
      <span aria-hidden="true" className={cn("inline-flex items-center text-[10px] leading-none font-bold whitespace-nowrap", className)}>
        {source.shortName}
      </span>
    );
  }
  return renderLogo(className);
}
