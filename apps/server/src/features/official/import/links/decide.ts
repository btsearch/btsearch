import type { LinkValues, StoredLink } from "./values.js";

export type LinkChange = { id: number; values: LinkValues };
type LinkDecision = {
  inserts: LinkValues[];
  updates: LinkChange[];
  renewals: LinkChange[];
  archivedIds: number[];
  duplicateRecords: number;
};

const RENEWAL_KEY_COLUMNS = [
  "operator_id",
  "tx_longitude",
  "tx_latitude",
  "rx_longitude",
  "rx_latitude",
  "freq",
  "polarization",
  "ch_num",
] as const satisfies readonly (keyof LinkValues)[];
const KEY_COLUMNS = ["permit_number", ...RENEWAL_KEY_COLUMNS] as const;

const COMPARED_COLUMNS = [
  "tx_height",
  "tx_city",
  "tx_province",
  "tx_street",
  "tx_location_description",
  "rx_height",
  "rx_city",
  "rx_province",
  "rx_street",
  "rx_location_description",
  "plan_symbol",
  "ch_width",
  "modulation_type",
  "bandwidth",
  "tx_eirp",
  "tx_antenna_attenuation",
  "tx_transmitter_type_id",
  "tx_antenna_type_id",
  "tx_antenna_gain",
  "tx_antenna_height",
  "rx_antenna_type_id",
  "rx_antenna_gain",
  "rx_antenna_height",
  "rx_noise_figure",
  "rx_atpc_attenuation",
  "decision_type",
  "issue_date",
  "expiry_date",
] as const satisfies readonly (keyof LinkValues)[];

function keyOf<Column extends keyof LinkValues>(link: Pick<LinkValues, Column>, columns: readonly Column[]): string {
  return JSON.stringify(columns.map((column) => link[column]));
}

function differs(stored: StoredLink, values: LinkValues): boolean {
  return COMPARED_COLUMNS.some((column) => values[column] !== undefined && stored[column] !== values[column]);
}

function groupByRenewalKey<Link extends Pick<LinkValues, (typeof RENEWAL_KEY_COLUMNS)[number]>>(links: readonly Link[]): Map<string, Link[]> {
  return Map.groupBy(links, (link) => keyOf(link, RENEWAL_KEY_COLUMNS));
}

function matchRenewals(unmatchedValues: readonly LinkValues[], unlistedLinks: readonly StoredLink[]): LinkChange[] {
  const unlistedByRenewalKey = groupByRenewalKey(unlistedLinks);
  const renewals: LinkChange[] = [];

  for (const [renewalKey, sameKeyValues] of groupByRenewalKey(unmatchedValues)) {
    const sameKeyLinks = unlistedByRenewalKey.get(renewalKey) ?? [];
    const [values] = sameKeyValues;
    const [stored] = sameKeyLinks;
    if (sameKeyValues.length !== 1 || sameKeyLinks.length !== 1 || !values || !stored) continue;
    if (values.ch_width === stored.ch_width) renewals.push({ id: stored.id, values });
  }

  return renewals;
}

export function decideLinks(storedLinks: readonly StoredLink[], publishedValues: readonly LinkValues[]): LinkDecision {
  const valuesByKey = new Map(publishedValues.map((values) => [keyOf(values, KEY_COLUMNS), values]));
  const storedByKey = new Map(storedLinks.map((link) => [keyOf(link, KEY_COLUMNS), link]));

  const listedIds = new Set<number>();
  const unmatchedValues: LinkValues[] = [];
  const updates: LinkChange[] = [];
  for (const [key, values] of valuesByKey) {
    const stored = storedByKey.get(key);
    if (!stored) {
      unmatchedValues.push(values);
      continue;
    }

    listedIds.add(stored.id);
    if (differs(stored, values)) updates.push({ id: stored.id, values });
  }

  const renewals = matchRenewals(
    unmatchedValues,
    storedLinks.filter((link) => !listedIds.has(link.id)),
  );
  const renewedIds = new Set(renewals.map((renewal) => renewal.id));
  const renewedValues = new Set(renewals.map((renewal) => renewal.values));

  return {
    inserts: unmatchedValues.filter((values) => !renewedValues.has(values)),
    updates,
    renewals,
    archivedIds: storedLinks.filter((link) => !listedIds.has(link.id) && !renewedIds.has(link.id)).map((link) => link.id),
    duplicateRecords: publishedValues.length - valuesByKey.size,
  };
}
