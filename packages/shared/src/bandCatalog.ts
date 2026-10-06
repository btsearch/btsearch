export type CatalogRat = "GSM" | "UMTS" | "LTE" | "NR";
export type CatalogDuplex = "FDD" | "TDD" | "SDL" | "SUL";
export type KhzRange = readonly [number, number];

type MhzRange = readonly [number, number];
type ChannelBlock = { first: number; last: number; offsetKhz: number } | { list: readonly number[]; offsetKhz: number };

export type CatalogBand = {
  code: string;
  rat: CatalogRat;
  number: number | null;
  labelMhz: number;
  duplex: CatalogDuplex;
  downlinkKhz: KhzRange | null;
  uplinkKhz: KhzRange | null;
  channels: readonly ChannelBlock[];
};

export type BandLike = {
  rat: string;
  value: number | null | undefined;
  duplex?: string | null;
  variant?: string | null;
  code?: string | null;
};

const CHANNEL_STEP_KHZ = { GSM: 200, UMTS: 200, LTE: 100 } as const;

const NR_RASTER = [
  { first: 0, last: 599_999, referenceKhz: 0, referenceChannel: 0, stepKhz: 5 },
  { first: 600_000, last: 2_016_666, referenceKhz: 3_000_000, referenceChannel: 600_000, stepKhz: 15 },
  { first: 2_016_667, last: 3_279_165, referenceKhz: 24_250_080, referenceChannel: 2_016_667, stepKhz: 60 },
] as const;

function khz(mhz: number): number {
  return Math.round(mhz * 1000);
}

function khzRange([low, high]: MhzRange): KhzRange {
  return [khz(low), khz(high)];
}

function gsm(
  code: string,
  labelMhz: number,
  uplink: MhzRange,
  downlink: MhzRange,
  blocks: readonly (readonly [first: number, last: number, downlinkMhz: number, atChannel: number])[],
): CatalogBand {
  return {
    code,
    rat: "GSM",
    number: null,
    labelMhz,
    duplex: "FDD",
    downlinkKhz: khzRange(downlink),
    uplinkKhz: khzRange(uplink),
    channels: blocks.map(([first, last, downlinkMhz, atChannel]) => ({
      first,
      last,
      offsetKhz: khz(downlinkMhz) - CHANNEL_STEP_KHZ.GSM * atChannel,
    })),
  };
}

function umts(
  code: string,
  number: number,
  labelMhz: number,
  uplink: MhzRange | null,
  downlink: MhzRange,
  general: readonly [offsetMhz: number, first: number, last: number],
  additional?: readonly [offsetMhz: number, list: readonly number[]],
): CatalogBand {
  const [offsetMhz, first, last] = general;
  const channels: ChannelBlock[] = [{ first, last, offsetKhz: khz(offsetMhz) }];
  if (additional) channels.push({ list: additional[1], offsetKhz: khz(additional[0]) });

  return {
    code,
    rat: "UMTS",
    number,
    labelMhz,
    duplex: uplink ? "FDD" : "SDL",
    downlinkKhz: khzRange(downlink),
    uplinkKhz: uplink ? khzRange(uplink) : null,
    channels,
  };
}

function lte(number: number, labelMhz: number, downlink: MhzRange, firstChannel: number, uplink: MhzRange | "TDD" | "SDL"): CatalogBand {
  const downlinkKhz = khzRange(downlink);
  const duplex = typeof uplink === "string" ? uplink : "FDD";
  let uplinkKhz: KhzRange | null = null;
  if (typeof uplink !== "string") uplinkKhz = khzRange(uplink);
  else if (uplink === "TDD") uplinkKhz = downlinkKhz;

  return {
    code: `B${number}`,
    rat: "LTE",
    number,
    labelMhz,
    duplex,
    downlinkKhz,
    uplinkKhz,
    channels: [
      {
        first: firstChannel,
        last: firstChannel + (downlinkKhz[1] - downlinkKhz[0]) / CHANNEL_STEP_KHZ.LTE - 1,
        offsetKhz: downlinkKhz[0] - CHANNEL_STEP_KHZ.LTE * firstChannel,
      },
    ],
  };
}

function nr(number: number, labelMhz: number, duplex: CatalogDuplex, uplink: MhzRange | null, downlink: MhzRange | null): CatalogBand {
  return {
    code: `n${number}`,
    rat: "NR",
    number,
    labelMhz,
    duplex,
    downlinkKhz: downlink ? khzRange(downlink) : null,
    uplinkKhz: uplink ? khzRange(uplink) : null,
    channels: [],
  };
}

function nrTdd(number: number, labelMhz: number, band: MhzRange): CatalogBand {
  return nr(number, labelMhz, "TDD", band, band);
}

const GSM_BANDS: readonly CatalogBand[] = [
  gsm("GSM450", 450, [450.4, 457.6], [460.4, 467.6], [[259, 293, 460.6, 259]]),
  gsm("GSM480", 480, [478.8, 486], [488.8, 496], [[306, 340, 489, 306]]),
  gsm("GSM850", 850, [824, 849], [869, 894], [[128, 251, 869.2, 128]]),
  gsm("P-GSM900", 900, [890, 915], [935, 960], [[1, 124, 935, 0]]),
  gsm(
    "E-GSM900",
    900,
    [880, 915],
    [925, 960],
    [
      [0, 124, 935, 0],
      [975, 1023, 935, 1024],
    ],
  ),
  gsm(
    "R-GSM900",
    900,
    [876, 915],
    [921, 960],
    [
      [0, 124, 935, 0],
      [955, 1023, 935, 1024],
    ],
  ),
  gsm(
    "ER-GSM900",
    900,
    [873, 915],
    [918, 960],
    [
      [0, 124, 935, 0],
      [940, 1023, 935, 1024],
    ],
  ),
  gsm("DCS1800", 1800, [1710, 1785], [1805, 1880], [[512, 885, 1805.2, 512]]),
  gsm("PCS1900", 1900, [1850, 1910], [1930, 1990], [[512, 810, 1930.2, 512]]),
];

const UMTS_BANDS: readonly CatalogBand[] = [
  umts("I", 1, 2100, [1920, 1980], [2110, 2170], [0, 10562, 10838]),
  umts("II", 2, 1900, [1850, 1910], [1930, 1990], [0, 9662, 9938], [1850.1, [412, 437, 462, 487, 512, 537, 562, 587, 612, 637, 662, 687]]),
  umts("III", 3, 1800, [1710, 1785], [1805, 1880], [1575, 1162, 1513]),
  umts("IV", 4, 1700, [1710, 1755], [2110, 2155], [1805, 1537, 1738], [1735.1, [1887, 1912, 1937, 1962, 1987, 2012, 2037, 2062, 2087]]),
  umts("V", 5, 850, [824, 849], [869, 894], [0, 4357, 4458], [670.1, [1007, 1012, 1032, 1037, 1062, 1087]]),
  umts("VI", 6, 800, [830, 840], [875, 885], [0, 4387, 4413], [670.1, [1037, 1062]]),
  umts(
    "VII",
    7,
    2600,
    [2500, 2570],
    [2620, 2690],
    [2175, 2237, 2563],
    [2105.1, [2587, 2612, 2637, 2662, 2687, 2712, 2737, 2762, 2787, 2812, 2837, 2862, 2887, 2912]],
  ),
  umts("VIII", 8, 900, [880, 915], [925, 960], [340, 2937, 3088]),
  umts("IX", 9, 1700, [1749.9, 1784.9], [1844.9, 1879.9], [0, 9237, 9387]),
  umts(
    "X",
    10,
    1700,
    [1710, 1770],
    [2110, 2170],
    [1490, 3112, 3388],
    [1430.1, [3412, 3437, 3462, 3487, 3512, 3537, 3562, 3587, 3612, 3637, 3662, 3687]],
  ),
  umts("XI", 11, 1500, [1427.9, 1447.9], [1475.9, 1495.9], [736, 3712, 3787]),
  umts("XII", 12, 700, [699, 716], [729, 746], [-37, 3842, 3903], [-54.9, [3932, 3957, 3962, 3987, 3992]]),
  umts("XIII", 13, 700, [777, 787], [746, 756], [-55, 4017, 4043], [-64.9, [4067, 4092]]),
  umts("XIV", 14, 700, [788, 798], [758, 768], [-63, 4117, 4143], [-72.9, [4167, 4192]]),
  umts("XIX", 19, 800, [830, 845], [875, 890], [735, 712, 763], [720.1, [787, 812, 837]]),
  umts("XX", 20, 800, [832, 862], [791, 821], [-109, 4512, 4638]),
  umts("XXI", 21, 1500, [1447.9, 1462.9], [1495.9, 1510.9], [1326, 862, 912]),
  umts("XXII", 22, 3500, [3410, 3490], [3510, 3590], [2580, 4662, 5038]),
  umts(
    "XXV",
    25,
    1900,
    [1850, 1915],
    [1930, 1995],
    [910, 5112, 5413],
    [674.1, [6292, 6317, 6342, 6367, 6392, 6417, 6442, 6467, 6492, 6517, 6542, 6567, 6592]],
  ),
  umts("XXVI", 26, 850, [814, 849], [859, 894], [-291, 5762, 5913], [-325.9, [5937, 5962, 5987, 5992, 6012, 6017, 6037, 6042, 6062, 6067, 6087]]),
  umts("XXXII", 32, 1500, null, [1452, 1496], [131, 6617, 6813], [87.1, [6837, 6862, 6887, 6912, 6937, 6962, 6987, 7012]]),
];

const LTE_BANDS: readonly CatalogBand[] = [
  lte(1, 2100, [2110, 2170], 0, [1920, 1980]),
  lte(2, 1900, [1930, 1990], 600, [1850, 1910]),
  lte(3, 1800, [1805, 1880], 1200, [1710, 1785]),
  lte(4, 1700, [2110, 2155], 1950, [1710, 1755]),
  lte(5, 850, [869, 894], 2400, [824, 849]),
  lte(6, 800, [875, 885], 2650, [830, 840]),
  lte(7, 2600, [2620, 2690], 2750, [2500, 2570]),
  lte(8, 900, [925, 960], 3450, [880, 915]),
  lte(9, 1700, [1844.9, 1879.9], 3800, [1749.9, 1784.9]),
  lte(10, 1700, [2110, 2170], 4150, [1710, 1770]),
  lte(11, 1500, [1475.9, 1495.9], 4750, [1427.9, 1447.9]),
  lte(12, 700, [729, 746], 5010, [699, 716]),
  lte(13, 700, [746, 756], 5180, [777, 787]),
  lte(14, 700, [758, 768], 5280, [788, 798]),
  lte(17, 700, [734, 746], 5730, [704, 716]),
  lte(18, 800, [860, 875], 5850, [815, 830]),
  lte(19, 800, [875, 890], 6000, [830, 845]),
  lte(20, 800, [791, 821], 6150, [832, 862]),
  lte(21, 1500, [1495.9, 1510.9], 6450, [1447.9, 1462.9]),
  lte(22, 3500, [3510, 3590], 6600, [3410, 3490]),
  lte(23, 2000, [2180, 2200], 7500, [2000, 2020]),
  lte(24, 1600, [1525, 1559], 7700, [1626.5, 1660.5]),
  lte(25, 1900, [1930, 1995], 8040, [1850, 1915]),
  lte(26, 850, [859, 894], 8690, [814, 849]),
  lte(27, 800, [852, 869], 9040, [807, 824]),
  lte(28, 700, [758, 803], 9210, [703, 748]),
  lte(29, 700, [717, 728], 9660, "SDL"),
  lte(30, 2300, [2350, 2360], 9770, [2305, 2315]),
  lte(31, 450, [462.5, 467.5], 9870, [452.5, 457.5]),
  lte(32, 1500, [1452, 1496], 9920, "SDL"),
  lte(33, 1900, [1900, 1920], 36000, "TDD"),
  lte(34, 2000, [2010, 2025], 36200, "TDD"),
  lte(35, 1900, [1850, 1910], 36350, "TDD"),
  lte(36, 1900, [1930, 1990], 36950, "TDD"),
  lte(37, 1900, [1910, 1930], 37550, "TDD"),
  lte(38, 2600, [2570, 2620], 37750, "TDD"),
  lte(39, 1900, [1880, 1920], 38250, "TDD"),
  lte(40, 2300, [2300, 2400], 38650, "TDD"),
  lte(41, 2500, [2496, 2690], 39650, "TDD"),
  lte(42, 3500, [3400, 3600], 41590, "TDD"),
  lte(43, 3700, [3600, 3800], 43590, "TDD"),
  lte(44, 700, [703, 803], 45590, "TDD"),
  lte(45, 1500, [1447, 1467], 46590, "TDD"),
  lte(46, 5200, [5150, 5925], 46790, "TDD"),
  lte(47, 5900, [5855, 5925], 54540, "TDD"),
  lte(48, 3500, [3550, 3700], 55240, "TDD"),
  lte(49, 3500, [3550, 3700], 56740, "TDD"),
  lte(50, 1500, [1432, 1517], 58240, "TDD"),
  lte(51, 1500, [1427, 1432], 59090, "TDD"),
  lte(52, 3300, [3300, 3400], 59140, "TDD"),
  lte(53, 2400, [2483.5, 2495], 60140, "TDD"),
  lte(54, 1700, [1670, 1675], 60255, "TDD"),
  lte(65, 2100, [2110, 2200], 65536, [1920, 2010]),
  lte(66, 1700, [2110, 2200], 66436, [1710, 1780]),
  lte(67, 700, [738, 758], 67336, "SDL"),
  lte(68, 700, [753, 783], 67536, [698, 728]),
  lte(69, 2600, [2570, 2620], 67836, "SDL"),
  lte(70, 2000, [1995, 2020], 68336, [1695, 1710]),
  lte(71, 600, [617, 652], 68586, [663, 698]),
  lte(72, 450, [461, 466], 68936, [451, 456]),
  lte(73, 450, [460, 465], 68986, [450, 455]),
  lte(74, 1500, [1475, 1518], 69036, [1427, 1470]),
  lte(75, 1500, [1432, 1517], 69466, "SDL"),
  lte(76, 1500, [1427, 1432], 70316, "SDL"),
  lte(85, 700, [728, 746], 70366, [698, 716]),
  lte(87, 410, [420, 425], 70546, [410, 415]),
  lte(88, 410, [422, 427], 70596, [412, 417]),
  lte(103, 700, [757, 758], 70646, [787, 788]),
  lte(106, 900, [935, 940], 70656, [896, 901]),
  lte(111, 1800, [1820, 1830], 73386, [1800, 1810]),
];

const NR_BANDS: readonly CatalogBand[] = [
  nr(1, 2100, "FDD", [1920, 1980], [2110, 2170]),
  nr(2, 1900, "FDD", [1850, 1910], [1930, 1990]),
  nr(3, 1800, "FDD", [1710, 1785], [1805, 1880]),
  nr(5, 850, "FDD", [824, 849], [869, 894]),
  nr(7, 2600, "FDD", [2500, 2570], [2620, 2690]),
  nr(8, 900, "FDD", [880, 915], [925, 960]),
  nr(12, 700, "FDD", [699, 716], [729, 746]),
  nr(13, 700, "FDD", [777, 787], [746, 756]),
  nr(14, 700, "FDD", [788, 798], [758, 768]),
  nr(18, 800, "FDD", [815, 830], [860, 875]),
  nr(20, 800, "FDD", [832, 862], [791, 821]),
  nr(24, 1600, "FDD", [1626.5, 1660.5], [1525, 1559]),
  nr(25, 1900, "FDD", [1850, 1915], [1930, 1995]),
  nr(26, 850, "FDD", [814, 849], [859, 894]),
  nr(28, 700, "FDD", [703, 748], [758, 803]),
  nr(29, 700, "SDL", null, [717, 728]),
  nr(30, 2300, "FDD", [2305, 2315], [2350, 2360]),
  nr(31, 450, "FDD", [452.5, 457.5], [462.5, 467.5]),
  nrTdd(34, 2000, [2010, 2025]),
  nrTdd(38, 2600, [2570, 2620]),
  nrTdd(39, 1900, [1880, 1920]),
  nrTdd(40, 2300, [2300, 2400]),
  nrTdd(41, 2500, [2496, 2690]),
  nrTdd(46, 5200, [5150, 5925]),
  nrTdd(47, 5900, [5855, 5925]),
  nrTdd(48, 3500, [3550, 3700]),
  nrTdd(50, 1500, [1432, 1517]),
  nrTdd(51, 1500, [1427, 1432]),
  nrTdd(53, 2400, [2483.5, 2495]),
  nrTdd(54, 1700, [1670, 1675]),
  nr(65, 2100, "FDD", [1920, 2010], [2110, 2200]),
  nr(66, 1700, "FDD", [1710, 1780], [2110, 2200]),
  nr(67, 700, "SDL", null, [738, 758]),
  nr(68, 700, "FDD", [698, 728], [753, 783]),
  nr(70, 2000, "FDD", [1695, 1710], [1995, 2020]),
  nr(71, 600, "FDD", [663, 698], [617, 652]),
  nr(72, 450, "FDD", [451, 456], [461, 466]),
  nr(74, 1500, "FDD", [1427, 1470], [1475, 1518]),
  nr(75, 1500, "SDL", null, [1432, 1517]),
  nr(76, 1500, "SDL", null, [1427, 1432]),
  nrTdd(77, 3700, [3300, 4200]),
  nrTdd(78, 3500, [3300, 3800]),
  nrTdd(79, 4700, [4400, 5000]),
  nr(80, 1800, "SUL", [1710, 1785], null),
  nr(81, 900, "SUL", [880, 915], null),
  nr(82, 800, "SUL", [832, 862], null),
  nr(83, 700, "SUL", [703, 748], null),
  nr(84, 2100, "SUL", [1920, 1980], null),
  nr(85, 700, "FDD", [698, 716], [728, 746]),
  nr(86, 1700, "SUL", [1710, 1780], null),
  nr(87, 410, "FDD", [410, 415], [420, 425]),
  nr(88, 410, "FDD", [412, 417], [422, 427]),
  nr(89, 850, "SUL", [824, 849], null),
  nrTdd(90, 2500, [2496, 2690]),
  nr(91, 1500, "FDD", [832, 862], [1427, 1432]),
  nr(92, 1500, "FDD", [832, 862], [1432, 1517]),
  nr(93, 1500, "FDD", [880, 915], [1427, 1432]),
  nr(94, 1500, "FDD", [880, 915], [1432, 1517]),
  nr(95, 2000, "SUL", [2010, 2025], null),
  nrTdd(96, 6000, [5925, 7125]),
  nr(97, 2300, "SUL", [2300, 2400], null),
  nr(98, 1900, "SUL", [1880, 1920], null),
  nr(99, 1600, "SUL", [1626.5, 1660.5], null),
  nr(100, 900, "FDD", [874.4, 880], [919.4, 925]),
  nrTdd(101, 1900, [1900, 1910]),
  nrTdd(102, 6000, [5925, 6425]),
  nrTdd(104, 6500, [6425, 7125]),
  nr(105, 600, "FDD", [663, 703], [612, 652]),
  nr(106, 900, "FDD", [896, 901], [935, 940]),
  nr(109, 1500, "FDD", [703, 733], [1432, 1517]),
  nr(110, 1400, "FDD", [1390, 1395], [1432, 1435]),
  nrTdd(257, 28000, [26500, 29500]),
  nrTdd(258, 26000, [24250, 27500]),
  nrTdd(259, 41000, [39500, 43500]),
  nrTdd(260, 39000, [37000, 40000]),
  nrTdd(261, 28000, [27500, 28350]),
  nrTdd(262, 47000, [47200, 48200]),
  nrTdd(263, 60000, [57000, 71000]),
];

type DefaultRule = { code: string; duplex?: string; variant?: string };

const DEFAULT_CODES: Record<CatalogRat, Record<number, readonly DefaultRule[]>> = {
  GSM: {
    850: [{ code: "GSM850" }],
    900: [
      { code: "R-GSM900", variant: "railway" },
      { code: "E-GSM900", variant: "commercial" },
    ],
    1800: [{ code: "DCS1800" }],
    1900: [{ code: "PCS1900" }],
  },
  UMTS: {
    800: [{ code: "VI" }],
    850: [{ code: "V" }],
    900: [{ code: "VIII" }],
    1700: [{ code: "IV" }],
    1800: [{ code: "III" }],
    1900: [{ code: "II" }],
    2100: [{ code: "I" }],
  },
  LTE: {
    700: [{ code: "B28" }],
    800: [{ code: "B20" }],
    850: [{ code: "B5" }],
    900: [{ code: "B8" }],
    1800: [{ code: "B3" }],
    1900: [{ code: "B2" }],
    2100: [{ code: "B1" }],
    2600: [
      { code: "B7", duplex: "FDD" },
      { code: "B38", duplex: "TDD" },
    ],
    3500: [{ code: "B42" }],
    3600: [{ code: "B43" }],
  },
  NR: {
    700: [{ code: "n28" }],
    800: [{ code: "n20" }],
    900: [{ code: "n8" }],
    1800: [{ code: "n3" }],
    2100: [{ code: "n1" }],
    2600: [
      { code: "n7", duplex: "FDD" },
      { code: "n41", duplex: "TDD" },
    ],
    3500: [{ code: "n78" }],
  },
};

export const BAND_CATALOG: readonly CatalogBand[] = [...GSM_BANDS, ...UMTS_BANDS, ...LTE_BANDS, ...NR_BANDS];

const BAND_BY_CODE = new Map(BAND_CATALOG.map((band) => [band.code, band]));

function isCatalogRat(rat: string): rat is CatalogRat {
  return rat === "GSM" || rat === "UMTS" || rat === "LTE" || rat === "NR";
}

export function findCatalogBand(code: string | null | undefined): CatalogBand | null {
  if (!code) return null;
  return BAND_BY_CODE.get(code) ?? null;
}

function resolveCatalogBands(band: BandLike): CatalogBand[] {
  const coded = findCatalogBand(band.code);
  if (coded && coded.rat === band.rat) return [coded];
  if (!isCatalogRat(band.rat) || band.value === null || band.value === undefined) return [];

  const rules = DEFAULT_CODES[band.rat][band.value] ?? [];
  return rules
    .filter((rule) => !rule.duplex || !band.duplex || rule.duplex === band.duplex)
    .filter((rule) => !rule.variant || rule.variant === (band.variant ?? "commercial"))
    .flatMap((rule) => findCatalogBand(rule.code) ?? []);
}

export function resolveCatalogBand(band: BandLike): CatalogBand | null {
  const [only, ...others] = resolveCatalogBands(band);
  return only && others.length === 0 ? only : null;
}

export function nrChannelKhz(channel: number): number | null {
  if (!Number.isInteger(channel)) return null;
  const raster = NR_RASTER.find((entry) => channel >= entry.first && channel <= entry.last);
  return raster ? raster.referenceKhz + raster.stepKhz * (channel - raster.referenceChannel) : null;
}

export function channelKhz(band: CatalogBand, channel: number): number | null {
  if (!Number.isInteger(channel)) return null;

  if (band.rat === "NR") {
    const frequency = nrChannelKhz(channel);
    if (frequency === null || band.downlinkKhz === null) return null;
    return frequency >= band.downlinkKhz[0] && frequency <= band.downlinkKhz[1] ? frequency : null;
  }

  const stepKhz = CHANNEL_STEP_KHZ[band.rat];
  for (const block of band.channels) {
    const contains = "list" in block ? block.list.includes(channel) : channel >= block.first && channel <= block.last;
    if (contains) return block.offsetKhz + stepKhz * channel;
  }
  return null;
}

export function bandsForChannel(rat: string, channel: number): CatalogBand[] {
  return BAND_CATALOG.filter((band) => band.rat === rat && channelKhz(band, channel) !== null);
}

export function isChannelValidForBand(band: BandLike, channel: number): boolean {
  if (band.rat !== "UMTS" && band.rat !== "LTE" && band.rat !== "NR") return true;

  const candidates = resolveCatalogBands(band);
  if (candidates.length === 0) return band.rat !== "NR" || nrChannelKhz(channel) !== null;
  return candidates.some((candidate) => channelKhz(candidate, channel) !== null);
}
