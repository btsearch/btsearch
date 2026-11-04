import type { IotRat, NrMode } from "@openbts/shared/contract";

import { IOT_RAT_OPTIONS } from "@/features/shared/rat";
import { toggleValue } from "@/lib/utils";

export const IOT_RAT = "iot";
const NR_RAT = "NR";

const NR_MODE_OPTIONS = [
  { value: "sa", label: "SA" },
  { value: "nsa", label: "NSA" },
] as const;

const IOT_RAT_URL_WORDS: Record<IotRat, string> = { nr: "redcap", lte: "lteiot" };

const IOT_RAT_CHOICES = IOT_RAT_OPTIONS.map((option) => ({ value: IOT_RAT_URL_WORDS[option.value], label: option.label, iotRat: option.value }));

export const RAT_CHOICE_GROUPS = [
  { rat: NR_RAT, labelKey: "main:filters.nrMode", options: NR_MODE_OPTIONS },
  { rat: IOT_RAT, labelKey: "main:filters.iotRat", options: IOT_RAT_CHOICES },
] as const;

const PARENT_RATS: ReadonlyMap<string, string> = new Map(
  RAT_CHOICE_GROUPS.flatMap((group) => group.options.map((option) => [option.value, group.rat] as const)),
);

export const RAT_CHOICE_VALUES: readonly string[] = [...PARENT_RATS.keys()];

export function keepRatChoicesWithTheirRat(rats: string[]): string[] {
  return rats.filter((rat) => {
    const parentRat = PARENT_RATS.get(rat);
    return parentRat === undefined || rats.includes(parentRat);
  });
}

export function toggleMapRat(rats: string[], rat: string): string[] {
  return keepRatChoicesWithTheirRat(toggleValue(rats, rat));
}

export function listNrModes(rats: readonly string[]): NrMode[] {
  return NR_MODE_OPTIONS.flatMap((mode) => (rats.includes(mode.value) ? [mode.value] : []));
}

export function listIotRats(rats: readonly string[]): IotRat[] {
  if (!rats.includes(IOT_RAT)) return [];
  const chosen = IOT_RAT_CHOICES.filter((choice) => rats.includes(choice.value));
  return (chosen.length > 0 ? chosen : IOT_RAT_CHOICES).map((choice) => choice.iotRat);
}
