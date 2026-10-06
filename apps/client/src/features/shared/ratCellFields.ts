type RatDetailField = {
  key: string;
  label: string;
  tooltip?: string;
};

const RAT_DETAIL_FIELDS: Record<string, readonly RatDetailField[]> = {
  GSM: [
    { key: "lac", label: "LAC", tooltip: "Local Area Code" },
    { key: "cid", label: "CID", tooltip: "Cell ID" },
  ],
  UMTS: [
    { key: "lac", label: "LAC", tooltip: "Local Area Code" },
    { key: "rnc", label: "RNC", tooltip: "Radio Network Controller" },
    { key: "cid", label: "CID", tooltip: "Cell ID" },
    { key: "cid_long", label: "LongCID", tooltip: "Long Cell ID · (RNC * 65536) + CID" },
    { key: "arfcn", label: "UARFCN", tooltip: "UTRA Absolute Radio Frequency Channel Number" },
  ],
  LTE: [
    { key: "tac", label: "TAC", tooltip: "Tracking Area Code" },
    { key: "enbid", label: "eNBID", tooltip: "eNodeB ID" },
    { key: "clid", label: "CLID", tooltip: "Cell Local ID" },
    { key: "ecid", label: "ECI", tooltip: "E-UTRAN Cell Identity · (eNBID * 256) + CLID" },
    { key: "pci", label: "PCI", tooltip: "Physical Cell ID" },
    { key: "earfcn", label: "EARFCN", tooltip: "E-UTRA Absolute Radio Frequency Channel Number" },
  ],
  NR: [
    { key: "nrtac", label: "TAC", tooltip: "Tracking Area Code" },
    { key: "clid", label: "CLID", tooltip: "Cell Local ID" },
    { key: "gnbid", label: "gNBID", tooltip: "gNodeB ID (22-32 bits)" },
    { key: "nci", label: "NCI", tooltip: "NR Cell Identity" },
    { key: "pci", label: "PCI", tooltip: "Physical Cell ID" },
    { key: "arfcn", label: "ARFCN", tooltip: "Absolute Radio Frequency Channel Number" },
  ],
};

export function getRatDetailFields(rat: string): readonly RatDetailField[] {
  const fields = Object.hasOwn(RAT_DETAIL_FIELDS, rat) ? RAT_DETAIL_FIELDS[rat] : undefined;
  return fields ?? [];
}

export function getRatDetailFieldLabel(rat: string, key: string): string {
  return getRatDetailFields(rat).find((field) => field.key === key)?.label ?? key.toUpperCase();
}
