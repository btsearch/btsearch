import type { ReactNode } from "react";

import type { GeocodingSource } from "@/lib/geo/geocoding";
import { cn } from "@/lib/utils";

type GeocodingAttributionProps = {
  source: GeocodingSource;
  className?: string;
};

function AttributionLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onPointerDown={(event) => event.preventDefault()}
      className="underline decoration-muted-foreground/40 underline-offset-2 transition-colors hover:text-foreground hover:decoration-current"
    >
      {children}
    </a>
  );
}

export function GeocodingAttribution({ source, className }: GeocodingAttributionProps) {
  return (
    <p className={cn("text-[10px] leading-4 text-muted-foreground", className)}>
      {source === "geoapify" ? (
        <>
          Powered by <AttributionLink href="https://www.geoapify.com/">Geoapify</AttributionLink>
        </>
      ) : (
        <AttributionLink href="https://locationiq.com">Search by LocationIQ.com</AttributionLink>
      )}
      {" · © "}
      <AttributionLink href="https://www.openstreetmap.org/copyright">OpenStreetMap</AttributionLink> contributors
    </p>
  );
}
