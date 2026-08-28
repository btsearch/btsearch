import { AirdropIcon, FlashIcon, RadioIcon, SignalFull02Icon, SmartPhone01Icon, Wifi01Icon } from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

import type { CellDetails } from "@/types/station";

export const RAT_ORDER = ["NR", "LTE", "UMTS", "GSM"] as const;

export type RatType = (typeof RAT_ORDER)[number];
type CellDetailKey = keyof NonNullable<CellDetails>;

type RatIdentityDuplicateRule = {
  fields: readonly string[];
  messageKey: string;
};

type RatCellSpec = {
  value: RatType;
  label: string;
  gen: string;
  detailKeys: readonly string[];
  booleanDetailKeys?: readonly string[];
  defaultDetails?: Record<string, unknown>;
  sharedDetailFields?: readonly string[];
  identityDuplicateRules?: readonly RatIdentityDuplicateRule[];
  channelField?: string;
  sortDetailField?: CellDetailKey;
  defaultBandDuplex?: string;
  defaultBandDuplexByValue?: Partial<Record<number, string>>;
  siblingSyncField?: string;
  showBandDuplex?: boolean;
  supportsSectorPciSync?: boolean;
};

type RatBandChoice = {
  rat: string;
  value: number;
  duplex: string | null;
};

export const RAT_CELL_SPECS: Record<RatType, RatCellSpec> = {
  NR: {
    value: "NR",
    label: "NR",
    gen: "5G",
    detailKeys: ["type", "nrtac", "gnbid", "clid", "pci", "arfcn", "supports_nr_redcap"],
    booleanDetailKeys: ["supports_nr_redcap"],
    defaultDetails: { type: "nsa" },
    sharedDetailFields: ["nrtac", "gnbid"],
    channelField: "arfcn",
    sortDetailField: "nci",
    defaultBandDuplexByValue: {
      700: "FDD",
      2100: "FDD",
      2600: "TDD",
      3500: "TDD",
    },
    siblingSyncField: "nrtac",
    supportsSectorPciSync: true,
  },
  LTE: {
    value: "LTE",
    label: "LTE",
    gen: "4G",
    detailKeys: ["tac", "enbid", "clid", "pci", "earfcn", "supports_iot"],
    booleanDetailKeys: ["supports_iot"],
    sharedDetailFields: ["tac", "enbid"],
    identityDuplicateRules: [{ fields: ["enbid", "clid"], messageKey: "validation.enbidClidDuplicate" }],
    channelField: "earfcn",
    sortDetailField: "ecid",
    defaultBandDuplexByValue: {
      700: "FDD",
      800: "FDD",
      900: "FDD",
      1800: "FDD",
      2100: "FDD",
    },
    siblingSyncField: "tac",
    supportsSectorPciSync: true,
  },
  UMTS: {
    value: "UMTS",
    label: "UMTS",
    gen: "3G",
    detailKeys: ["lac", "arfcn", "rnc", "cid"],
    sharedDetailFields: ["lac", "rnc"],
    identityDuplicateRules: [{ fields: ["cid"], messageKey: "validation.cidDuplicate" }],
    channelField: "arfcn",
    sortDetailField: "cid_long",
    defaultBandDuplex: "FDD",
    siblingSyncField: "lac",
  },
  GSM: {
    value: "GSM",
    label: "GSM",
    gen: "2G",
    detailKeys: ["lac", "cid", "e_gsm"],
    booleanDetailKeys: ["e_gsm"],
    sharedDetailFields: ["lac"],
    identityDuplicateRules: [{ fields: ["cid"], messageKey: "validation.cidDuplicate" }],
    sortDetailField: "cid",
    siblingSyncField: "lac",
    showBandDuplex: false,
  },
};

export const RAT_ICONS: Record<string, IconSvgElement> = {
  GSM: SignalFull02Icon,
  UMTS: Wifi01Icon,
  LTE: SmartPhone01Icon,
  NR: FlashIcon,
  CDMA: RadioIcon,
  IOT: AirdropIcon,
  OTHER: SignalFull02Icon,
};

export const RAT_OPTIONS: { value: RatType; label: string; gen: string }[] = RAT_ORDER.map((rat) => {
  const { value, label, gen } = RAT_CELL_SPECS[rat];
  return { value, label, gen };
});

export const EXTENDED_RAT_OPTIONS: { value: string; label: string; gen: string }[] = [...RAT_OPTIONS, { value: "IOT", label: "IoT", gen: "NB" }];

export function getRatCellSpec(rat: string): RatCellSpec | undefined {
  if (rat in RAT_CELL_SPECS) return RAT_CELL_SPECS[rat as RatType];
  return undefined;
}

export function getRatCellSpecs(): RatCellSpec[] {
  return RAT_ORDER.map((rat) => RAT_CELL_SPECS[rat]);
}

export function getCellDetailKeys(rat: string): readonly string[] {
  return getRatCellSpec(rat)?.detailKeys ?? [];
}

export function getCellDetailDefaultValue(rat: string, key: string): unknown {
  const spec = getRatCellSpec(rat);
  if (spec?.defaultDetails && key in spec.defaultDetails) return spec.defaultDetails[key];
  if (spec?.booleanDetailKeys?.includes(key)) return false;
  return null;
}

export function getSharedDetailFields(rat: string): string[] {
  return [...(getRatCellSpec(rat)?.sharedDetailFields ?? [])];
}

export function getRatChannelField(rat: string): string | undefined {
  return getRatCellSpec(rat)?.channelField;
}

export function getRatSortDetailField(rat: string): CellDetailKey | undefined {
  return getRatCellSpec(rat)?.sortDetailField;
}

type SortableCellDetails = Partial<Record<CellDetailKey, unknown>> | null | undefined;

function getNumericDetailValue(details: SortableCellDetails, field: CellDetailKey | undefined): number {
  if (!field || !details) return 0;
  const value = Number(details[field] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export function compareRatCellDetails(rat: string, detailsA: SortableCellDetails, detailsB: SortableCellDetails): number {
  if (rat === "NR" && detailsA?.type === "nsa" && detailsB?.type === "nsa")
    return getNumericDetailValue(detailsA, "pci") - getNumericDetailValue(detailsB, "pci");

  const sortField = getRatSortDetailField(rat);
  return getNumericDetailValue(detailsA, sortField) - getNumericDetailValue(detailsB, sortField);
}

export function getRatDefaultBandDuplex(rat: string, bandValue?: number | null): string | undefined {
  const spec = getRatCellSpec(rat);
  if (bandValue !== undefined && bandValue !== null) return spec?.defaultBandDuplexByValue?.[bandValue] ?? spec?.defaultBandDuplex;
  return spec?.defaultBandDuplex;
}

export function findPreferredRatBand<T extends RatBandChoice>(
  bands: readonly T[],
  rat: string,
  bandValue?: number | null,
  preferredDuplex?: string | null,
  fallbackDuplex?: string | null,
): T | undefined {
  if (bandValue === null) return undefined;
  const matchingBands = bands.filter((band) => band.rat === rat && (bandValue === undefined || band.value === bandValue));
  if (matchingBands.length === 0) return undefined;
  if (preferredDuplex !== undefined) {
    const preferredBand = matchingBands.find((band) => band.duplex === preferredDuplex);
    if (preferredBand) return preferredBand;
  }
  if (bandValue !== undefined) {
    const defaultDuplex = getRatDefaultBandDuplex(rat, bandValue);
    const defaultBand = defaultDuplex !== undefined ? matchingBands.find((band) => band.duplex === defaultDuplex) : undefined;
    if (defaultBand) return defaultBand;
  } else {
    const defaultBand = matchingBands.find((band) => {
      const defaultDuplex = getRatDefaultBandDuplex(rat, band.value);
      return defaultDuplex !== undefined && band.duplex === defaultDuplex;
    });
    if (defaultBand) return defaultBand;
  }
  if (fallbackDuplex !== undefined) {
    const fallbackBand = matchingBands.find((band) => band.duplex === fallbackDuplex);
    if (fallbackBand) return fallbackBand;
  }
  if (bandValue === undefined) {
    const defaultDuplex = getRatDefaultBandDuplex(rat);
    const defaultBand = defaultDuplex !== undefined ? matchingBands.find((band) => band.duplex === defaultDuplex) : undefined;
    if (defaultBand) return defaultBand;
  }
  return matchingBands[0];
}

export function getRatSiblingSyncField(rat: string): string | undefined {
  return getRatCellSpec(rat)?.siblingSyncField;
}

export function getRatSectorColumnIndex(rat: string): number {
  return getRatShowsBandDuplex(rat) ? 2 : 1;
}

export function getRatShowsBandDuplex(rat: string): boolean {
  return getRatCellSpec(rat)?.showBandDuplex ?? true;
}

export function getRatSupportsSectorPciSync(rat: string): boolean {
  return getRatCellSpec(rat)?.supportsSectorPciSync ?? false;
}

export function ratToGenLabel(rat: string): string {
  return getRatCellSpec(rat)?.gen ?? rat;
}
