export type HouseAdSize = "320x50" | "224x200";

type HouseAdLanguage = "en" | "pl";

type HouseAdCreative = { src: string; srcSet: string };

export type HouseAdEntry = {
  name: string;
  href: string;
  altKey: string;
  descriptionKey: string;
  creatives: Partial<Record<HouseAdSize, Record<HouseAdLanguage, HouseAdCreative>>>;
};

function webpCreative(path: string): HouseAdCreative {
  return { src: `${path}.webp`, srcSet: `${path}@2x.webp 2x` };
}

export const HOUSE_ADS: readonly HouseAdEntry[] = [
  {
    name: "bunnylock",
    href: "https://github.com/btsearch/bunnylock/releases",
    altKey: "ads.bunnylock",
    descriptionKey: "about.ads.bunnylock",
    creatives: {
      "320x50": { en: webpCreative("/assets/bunnylock/strip-en"), pl: webpCreative("/assets/bunnylock/strip-pl") },
      "224x200": { en: webpCreative("/assets/bunnylock/card-en"), pl: webpCreative("/assets/bunnylock/card-pl") },
    },
  },
];

export function findHouseAdCreative(entry: HouseAdEntry, size: HouseAdSize, language: string | undefined): HouseAdCreative | undefined {
  return entry.creatives[size]?.[language?.startsWith("pl") ? "pl" : "en"];
}

export function pickHouseAd(size: HouseAdSize): HouseAdEntry | null {
  const candidates = HOUSE_ADS.filter((entry) => entry.creatives[size] !== undefined);
  return candidates[Math.floor(Math.random() * candidates.length)] ?? null;
}
