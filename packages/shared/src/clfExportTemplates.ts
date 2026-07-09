export const CLF_DESCRIPTION_TEMPLATE_RATS = ["GSM", "UMTS", "LTE", "NR_NSA", "NR"] as const;

export type CLFDescriptionTemplateRat = (typeof CLF_DESCRIPTION_TEMPLATE_RATS)[number];
export type CLFDescriptionTemplates = Partial<Record<CLFDescriptionTemplateRat, string>>;
export type CLFDescriptionTemplateParam = (typeof CLF_DESCRIPTION_TEMPLATE_PARAM_BY_RAT)[CLFDescriptionTemplateRat];
export type CLFDescriptionTemplatePlaceholder =
  (typeof CLF_DESCRIPTION_TEMPLATE_PLACEHOLDERS_BY_RAT)[keyof typeof CLF_DESCRIPTION_TEMPLATE_PLACEHOLDERS_BY_RAT][number];
export type CLFDescriptionTemplateValue = string | number | bigint | null | undefined;
export type CLFDescriptionTemplateValues = Partial<Record<CLFDescriptionTemplatePlaceholder, CLFDescriptionTemplateValue>>;

export const CLF_DESCRIPTION_TEMPLATE_MAX_LENGTH = 300;
export const DISPLAY_NR_SEPARATELY_PARAM = "displayNRSeparately";

export const CLF_DESCRIPTION_TEMPLATE_LABELS = {
  GSM: "GSM",
  UMTS: "UMTS",
  LTE: "LTE",
  NR_NSA: "NR NSA",
  NR: "NR SA",
} as const satisfies Record<CLFDescriptionTemplateRat, string>;

export const CLF_DESCRIPTION_TEMPLATE_PARAM_BY_RAT = {
  GSM: "templateGsm",
  UMTS: "templateUmts",
  LTE: "templateLte",
  NR_NSA: "templateNRNsa",
  NR: "templateNR",
} as const satisfies Record<CLFDescriptionTemplateRat, string>;

export const CLF_DESCRIPTION_TEMPLATE_DEFAULTS = {
  GSM: "{unconfirmed_prefix} {sector_prefix} {location} [{station_id} {gsm_band}]",
  UMTS: "{unconfirmed_prefix} {sector_prefix} {location} [{station_id} {umts_band} {umts_rnc}:{umts_cid}]",
  LTE: "{unconfirmed_prefix} {sector_prefix} {location} [{station_id} L{lte_band_value}:{lte_enbid}:{lte_clid} {nr_band}:{nr_pcis}]",
  NR_NSA: "{unconfirmed_prefix} {sector_prefix} {location} [{station_id} {nr_band}:{nr_pci}]",
  NR: "{unconfirmed_prefix} {sector_prefix} {location} [{station_id} {nr_gnbid}:{nr_clid} {nr_band}:{nr_pci}]",
} as const satisfies Record<CLFDescriptionTemplateRat, string>;

export const CLF_DESCRIPTION_COMMON_TEMPLATE_PLACEHOLDERS = [
  "unconfirmed_prefix",
  "sector_prefix",
  "sector_tag",
  "sector_label",
  "sector_number",
  "sector_azimuth",
  "location",
  "region",
  "station_id",
] as const;

type CLFDescriptionCommonTemplatePlaceholder = (typeof CLF_DESCRIPTION_COMMON_TEMPLATE_PLACEHOLDERS)[number];

export const CLF_DESCRIPTION_NR_TEMPLATE_PLACEHOLDERS = ["nr_type", "nr_band", "nr_band_value", "nr_pci", "nr_pcis"] as const;

export const CLF_DESCRIPTION_TEMPLATE_PLACEHOLDERS_BY_RAT = {
  GSM: [...CLF_DESCRIPTION_COMMON_TEMPLATE_PLACEHOLDERS, "gsm_band", "gsm_lac", "gsm_cid"],
  UMTS: [...CLF_DESCRIPTION_COMMON_TEMPLATE_PLACEHOLDERS, "umts_band", "umts_rnc", "umts_cid", "umts_arfcn", "umts_lac"],
  LTE: [
    ...CLF_DESCRIPTION_COMMON_TEMPLATE_PLACEHOLDERS,
    "lte_band",
    "lte_band_value",
    "duplex",
    "lte_pci",
    "lte_earfcn",
    "lte_tac",
    "lte_enbid",
    "lte_clid",
    ...CLF_DESCRIPTION_NR_TEMPLATE_PLACEHOLDERS,
  ],
  NR_NSA: [...CLF_DESCRIPTION_COMMON_TEMPLATE_PLACEHOLDERS, "nr_arfcn", ...CLF_DESCRIPTION_NR_TEMPLATE_PLACEHOLDERS],
  NR: [...CLF_DESCRIPTION_COMMON_TEMPLATE_PLACEHOLDERS, "nr_gnbid", "nr_clid", "nr_arfcn", "nr_tac", ...CLF_DESCRIPTION_NR_TEMPLATE_PLACEHOLDERS],
} as const satisfies Record<CLFDescriptionTemplateRat, readonly string[]>;

const CLF_DESCRIPTION_COMMON_TEMPLATE_PREVIEW_VALUES = {
  unconfirmed_prefix: "[!]",
  sector_prefix: "[S1: 120°]",
  sector_tag: "S1: 120°",
  sector_label: "S1",
  sector_number: "1",
  sector_azimuth: "120°",
  location: "ul. Bazyliańska 18 - dach bloku mieszkalnego, Warszawa - Targówek",
  region: "MAZ",
  station_id: "WAR2257",
} as const satisfies Record<CLFDescriptionCommonTemplatePlaceholder, string>;

export const CLF_DESCRIPTION_TEMPLATE_PREVIEW_VALUES: Record<CLFDescriptionTemplateRat, Record<string, string>> = {
  GSM: {
    ...CLF_DESCRIPTION_COMMON_TEMPLATE_PREVIEW_VALUES,
    gsm_band: "G900",
    gsm_lac: "1201",
    gsm_cid: "42101",
  },
  UMTS: {
    ...CLF_DESCRIPTION_COMMON_TEMPLATE_PREVIEW_VALUES,
    umts_band: "U2100",
    umts_rnc: "42",
    umts_cid: "11021",
    umts_arfcn: "10787",
    umts_lac: "1201",
  },
  LTE: {
    ...CLF_DESCRIPTION_COMMON_TEMPLATE_PREVIEW_VALUES,
    lte_band: "b3",
    duplex: "FDD",
    lte_pci: "128",
    lte_earfcn: "1300",
    lte_tac: "32010",
    lte_enbid: "12345",
    lte_clid: "7",
    lte_band_value: "1800",
    nr_type: "NSA",
    nr_band: "n78",
    nr_band_value: "3500",
    nr_pci: "42",
    nr_pcis: "42,31",
  },
  NR_NSA: {
    ...CLF_DESCRIPTION_COMMON_TEMPLATE_PREVIEW_VALUES,
    nr_pci: "42",
    nr_arfcn: "428000",
    nr_tac: "",
    nr_band: "n1",
    nr_type: "NSA",
    nr_band_value: "2100",
    nr_pcis: "42",
  },
  NR: {
    ...CLF_DESCRIPTION_COMMON_TEMPLATE_PREVIEW_VALUES,
    nr_gnbid: "987654",
    nr_clid: "12",
    nr_pci: "42",
    nr_arfcn: "643392",
    nr_tac: "32010",
    nr_band: "n78",
    nr_type: "SA",
    nr_band_value: "3500",
    nr_pcis: "42,31",
  },
};

const TEMPLATE_VAR_RE = /\{(\w+)\}/g;
const SEPARATOR_CLEANUP_PLACEHOLDERS = new Set(["lte_pci", "nr_pci", "nr_pcis", "nr_band"]);
const OPTIONAL_PREFIX_PLACEHOLDERS = new Set(["unconfirmed_prefix", "sector_prefix"]);

function shouldRenderEmptyPlaceholder(key: string): boolean {
  return !SEPARATOR_CLEANUP_PLACEHOLDERS.has(key) && !OPTIONAL_PREFIX_PLACEHOLDERS.has(key);
}

function getNextIndexAfterOptionalPrefix(template: string, nextIndex: number): number {
  if (template[nextIndex] === " ") return nextIndex + 1;
  return nextIndex;
}

function trimTrailingSeparator(value: string): string {
  return value.replace(/[ :]$/, "");
}

export function renderCLFDescriptionTemplate(template: string, getValue: (key: string) => string): string {
  let output = "";
  let lastIndex = 0;

  for (const match of template.matchAll(TEMPLATE_VAR_RE)) {
    const key = match[1];
    const index = match.index;
    if (key === undefined || index === undefined) continue;

    const nextIndex = index + match[0].length;
    output += template.slice(lastIndex, index);

    const value = getValue(key);
    if (value || shouldRenderEmptyPlaceholder(key)) {
      output += value;
      lastIndex = nextIndex;
      continue;
    }

    if (OPTIONAL_PREFIX_PLACEHOLDERS.has(key) && !output.endsWith(" ")) {
      lastIndex = getNextIndexAfterOptionalPrefix(template, nextIndex);
      continue;
    }

    output = trimTrailingSeparator(output);
    lastIndex = nextIndex;
  }

  return output + template.slice(lastIndex);
}

export function normalizeCLFDescriptionTemplates(templates: CLFDescriptionTemplates): CLFDescriptionTemplates {
  const normalized: CLFDescriptionTemplates = {};
  for (const rat of CLF_DESCRIPTION_TEMPLATE_RATS) {
    const value = templates[rat]?.trim();
    if (value) normalized[rat] = value;
  }
  return normalized;
}

export function renderClfTemplatePreview(rat: CLFDescriptionTemplateRat, template: string): string {
  const source = template.trim() || CLF_DESCRIPTION_TEMPLATE_DEFAULTS[rat];
  return renderCLFDescriptionTemplate(source, (key) => CLF_DESCRIPTION_TEMPLATE_PREVIEW_VALUES[rat][key] ?? "");
}
