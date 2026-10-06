import { useState } from "react";

import type { BrandLook } from "@/components/cellular/brandMark";
import { cn } from "@/lib/utils";

type BrandTileSize = 32 | 56 | 72;

type BrandTileProps = {
  brand: BrandLook | null | undefined;
  size?: BrandTileSize;
};

const NEUTRAL_SQUARE_CLASS = "bg-muted-foreground/50";
const TILE_SIZE_CLASSES: Record<BrandTileSize, string> = {
  32: "size-8 rounded-lg",
  56: "size-14 rounded-xl",
  72: "size-12 rounded-lg sm:size-18 sm:rounded-2xl",
};

export function BrandTile({ brand, size = 32 }: BrandTileProps) {
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);
  const logo = brand?.logo ?? null;
  const color = brand?.color;

  return (
    <span aria-hidden="true" className={cn("inline-flex shrink-0 items-center justify-center bg-muted", TILE_SIZE_CLASSES[size])}>
      {logo !== null && logo.url !== failedLogoUrl ? (
        <img
          src={logo.url}
          alt=""
          width={logo.width}
          height={logo.height}
          className="h-[55%] w-auto max-w-[75%] rounded-[2px] object-contain"
          onError={() => setFailedLogoUrl(logo.url)}
        />
      ) : (
        <span style={{ backgroundColor: color }} className={cn("size-[30%] rounded-[4px]", color === undefined ? NEUTRAL_SQUARE_CLASS : null)} />
      )}
    </span>
  );
}
