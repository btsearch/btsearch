import { useState } from "react";
import { useTranslation } from "react-i18next";

import { type HouseAdSize, findHouseAdCreative, pickHouseAd } from "../houseAds";
import { CloseButton } from "@/components/ui/close-button";
import { cn } from "@/lib/utils";

type HouseAdProps = {
  size: HouseAdSize;
  onClose?: () => void;
  className?: string;
};

const HOUSE_AD_DIMENSIONS: Record<HouseAdSize, { width: number; height: number }> = {
  "320x50": { width: 320, height: 50 },
  "224x200": { width: 224, height: 200 },
};

export function HouseAd({ size, onClose, className }: HouseAdProps) {
  const { t, i18n } = useTranslation("main");
  const [entry] = useState(() => pickHouseAd(size));
  const creative = entry === null ? undefined : findHouseAdCreative(entry, size, i18n.resolvedLanguage);
  if (entry === null || creative === undefined) return null;

  const { width, height } = HOUSE_AD_DIMENSIONS[size];
  return (
    <div className={cn("relative w-fit max-w-full shrink-0", className)}>
      <a href={entry.href} target="_blank" rel="noopener noreferrer" className="block">
        <img
          src={creative.src}
          srcSet={creative.srcSet}
          width={width}
          height={height}
          alt={t(entry.altKey)}
          loading="lazy"
          decoding="async"
          className="block h-auto max-w-full"
        />
      </a>
      {onClose === undefined ? null : (
        <CloseButton size="xs" label={t("ads.dismiss")} onClick={onClose} className="absolute top-1 right-1 bg-background/80 hover:bg-background" />
      )}
    </div>
  );
}
