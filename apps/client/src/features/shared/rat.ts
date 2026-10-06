export const RAT_ORDER = ["NR", "LTE", "UMTS", "GSM"] as const;

export type RatType = (typeof RAT_ORDER)[number];

type RatCellSpec = {
  value: RatType;
  label: string;
  gen: string;
};

export const RAT_CELL_SPECS: Record<RatType, RatCellSpec> = {
  NR: { value: "NR", label: "NR", gen: "5G" },
  LTE: { value: "LTE", label: "LTE", gen: "4G" },
  UMTS: { value: "UMTS", label: "UMTS", gen: "3G" },
  GSM: { value: "GSM", label: "GSM", gen: "2G" },
};

const RAT_OPTIONS: RatCellSpec[] = RAT_ORDER.map((rat) => RAT_CELL_SPECS[rat]);

export const EXTENDED_RAT_OPTIONS: { value: string; label: string; gen: string }[] = [...RAT_OPTIONS, { value: "IOT", label: "IoT", gen: "NB" }];

function getRatCellSpec(rat: string): RatCellSpec | undefined {
  if (rat in RAT_CELL_SPECS) return RAT_CELL_SPECS[rat as RatType];
  return undefined;
}

export function ratToGenLabel(rat: string): string {
  if (rat === "CDMA") return "3G";
  if (rat === "IOT") return "NB";
  return getRatCellSpec(rat)?.gen ?? rat;
}
