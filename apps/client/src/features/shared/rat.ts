import type { Band } from "@/types/station";

export const RAT_ORDER = ["NR", "LTE", "UMTS", "GSM"] as const;

export type RatType = (typeof RAT_ORDER)[number];

type RatCellSpec = {
  value: RatType;
  label: string;
  gen: string;
};

export type RatOption = {
  value: string;
  label: string;
  gen: string | null;
};

export const RAT_CELL_SPECS: Record<RatType, RatCellSpec> = {
  NR: { value: "NR", label: "NR", gen: "5G" },
  LTE: { value: "LTE", label: "LTE", gen: "4G" },
  UMTS: { value: "UMTS", label: "UMTS", gen: "3G" },
  GSM: { value: "GSM", label: "GSM", gen: "2G" },
};

const RAT_OPTIONS: RatCellSpec[] = RAT_ORDER.map((rat) => RAT_CELL_SPECS[rat]);

const REGISTER_GENERATIONS: ReadonlyMap<string, string> = new Map([
  ["CDMA", "3G"],
  ["GSM-R", "2G"],
  ["IOT", "NB"],
]);

export const EXTENDED_RAT_OPTIONS: { value: string; label: string; gen: string }[] = [...RAT_OPTIONS, { value: "IOT", label: "IoT", gen: "NB" }];

function getRatCellSpec(rat: string): RatCellSpec | undefined {
  if (rat in RAT_CELL_SPECS) return RAT_CELL_SPECS[rat as RatType];
  return undefined;
}

export function ratToGenLabel(rat: string): string | null {
  return getRatCellSpec(rat)?.gen ?? REGISTER_GENERATIONS.get(rat) ?? null;
}

export function toRegisterRatOption(rat: string): RatOption {
  if (rat === "IOT" || rat === "iot") return { value: "iot", label: "IoT", gen: ratToGenLabel("IOT") };
  return { value: rat, label: rat, gen: ratToGenLabel(rat) };
}

export function listRegisterRatOptions(registerBands: readonly Pick<Band, "rat" | "variant">[]): RatOption[] {
  const options = new Map<string, RatOption>();

  for (const band of registerBands) {
    const rat = band.rat === "GSM" && band.variant === "railway" ? "GSM-R" : band.rat;
    const option = toRegisterRatOption(rat);
    if (!options.has(option.value)) options.set(option.value, option);
  }

  return [...options.values()];
}

export function compareRatsByName(left: string, right: string): number {
  return left.localeCompare(right);
}

export function toRegisterRatComparator(registerBands: readonly Pick<Band, "rat">[]): (left: string, right: string) => number {
  const positions = new Map([...new Set(registerBands.map((band) => band.rat))].map((rat, index) => [rat, index]));
  return (left, right) => {
    const leftPosition = positions.get(left) ?? Number.MAX_SAFE_INTEGER;
    const rightPosition = positions.get(right) ?? Number.MAX_SAFE_INTEGER;
    return leftPosition - rightPosition || compareRatsByName(left, right);
  };
}
