import type { Brand } from "@openbts/shared/contract";
import { useState } from "react";

import { cn } from "@/lib/utils";

export type BrandLook = Pick<Brand, "color" | "logo">;

type BrandMarkProps = {
  brand: BrandLook | null | undefined;
  size?: number;
  showFallback?: boolean;
};

const MARK_SQUARE_RATIO = 0.625;
const MARK_SQUARE_MAX_SIZE = 10;
const MARK_LOGO_MAX_ASPECT = 3;
const NEUTRAL_SQUARE_CLASS = "bg-muted-foreground/50";
const failedLogoUrls = new Set<string>();

export function BrandMark({ brand, size = 16, showFallback = true }: BrandMarkProps) {
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);
  const logo = brand?.logo ?? null;

  if (logo !== null && logo.url !== failedLogoUrl && !failedLogoUrls.has(logo.url)) {
    return (
      <img
        key={logo.url}
        src={logo.url}
        alt=""
        width={logo.width}
        height={logo.height}
        style={{ height: size, width: Math.min(size * (logo.width / logo.height), size * MARK_LOGO_MAX_ASPECT) }}
        className="shrink-0 rounded-[2px] object-contain"
        onError={() => {
          failedLogoUrls.add(logo.url);
          setFailedLogoUrl(logo.url);
        }}
      />
    );
  }

  if (!showFallback) return null;

  const color = brand?.color;
  const squareSize = Math.min(MARK_SQUARE_MAX_SIZE, Math.round(size * MARK_SQUARE_RATIO));

  return (
    <span
      aria-hidden="true"
      style={{ width: squareSize, height: squareSize, backgroundColor: color }}
      className={cn("inline-block shrink-0 rounded-[3px]", color === undefined ? NEUTRAL_SQUARE_CLASS : null)}
    />
  );
}
