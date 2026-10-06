import type { Brand } from "@openbts/shared/contract";
import { useState } from "react";

import { cn } from "@/lib/utils";

export type BrandLook = Pick<Brand, "color" | "logo">;

type BrandMarkProps = {
  brand: BrandLook | null | undefined;
  size?: number;
};

const MARK_SQUARE_RATIO = 0.625;
const MARK_SQUARE_MAX_SIZE = 10;
const MARK_LOGO_MAX_ASPECT = 3;
const NEUTRAL_SQUARE_CLASS = "bg-muted-foreground/50";

export function BrandMark({ brand, size = 16 }: BrandMarkProps) {
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);
  const logo = brand?.logo ?? null;

  if (logo !== null && logo.url !== failedLogoUrl) {
    return (
      <img
        src={logo.url}
        alt=""
        width={logo.width}
        height={logo.height}
        style={{ height: size, maxWidth: size * MARK_LOGO_MAX_ASPECT }}
        className="w-auto shrink-0 rounded-[2px] object-contain"
        onError={() => setFailedLogoUrl(logo.url)}
      />
    );
  }

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
