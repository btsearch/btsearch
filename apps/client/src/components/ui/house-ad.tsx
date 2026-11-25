import { useState } from "react";
import { useTranslation } from "react-i18next";

export type HouseAdSize = "320x50" | "224x200";

type HouseAdCreative = { src: string; srcSet: string };

type HouseAdEntry = {
  href: string;
  altKey: string;
  creatives: Partial<Record<HouseAdSize, HouseAdCreative>>;
};

type HouseAdPick = { entry: HouseAdEntry; creative: HouseAdCreative };

const HOUSE_AD_DIMENSIONS: Record<HouseAdSize, { width: number; height: number }> = {
  "320x50": { width: 320, height: 50 },
  "224x200": { width: 224, height: 200 },
};

const HOUSE_ADS: readonly HouseAdEntry[] = [
  {
    href: "https://github.com/btsearch/bunnylock/releases",
    altKey: "ads.bunnylock",
    creatives: {
      "320x50": { src: "/assets/bunnylock/strip.webp", srcSet: "/assets/bunnylock/strip@2x.webp 2x" },
      "224x200": { src: "/assets/bunnylock/card.webp", srcSet: "/assets/bunnylock/card@2x.webp 2x" },
    },
  },
];

function pickHouseAd(size: HouseAdSize): HouseAdPick | null {
  const candidates = HOUSE_ADS.flatMap((entry) => {
    const creative = entry.creatives[size];
    return creative === undefined ? [] : [{ entry, creative }];
  });
  return candidates[Math.floor(Math.random() * candidates.length)] ?? null;
}

export function HouseAd({ size }: { size: HouseAdSize }) {
  const { t } = useTranslation("main");
  const [pick] = useState(() => pickHouseAd(size));
  if (pick === null) return null;

  const { width, height } = HOUSE_AD_DIMENSIONS[size];
  return (
    <a href={pick.entry.href} target="_blank" rel="noopener noreferrer" className="block w-fit max-w-full shrink-0">
      <img
        src={pick.creative.src}
        srcSet={pick.creative.srcSet}
        width={width}
        height={height}
        alt={t(pick.entry.altKey)}
        decoding="async"
        className="block h-auto max-w-full"
      />
    </a>
  );
}
