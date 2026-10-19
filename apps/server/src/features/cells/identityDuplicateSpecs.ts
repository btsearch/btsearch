import { DEFAULT_GNBID_LENGTH } from "@openbts/shared/contract";

export type CellIdentityDuplicateDetails = Record<string, unknown>;

type CellIdentityFieldSpec = {
  field: string;
  fallback?: number;
};

export type CellIdentityDuplicateSpec = {
  rat: string;
  label: string;
  fields: readonly CellIdentityFieldSpec[];
  requiredFields: readonly string[];
  duplicateLabel: string;
  isUnknownWhenZero: boolean;
  identityDetails?: (details: CellIdentityDuplicateDetails) => CellIdentityDuplicateDetails;
};

export type CellIdentityDuplicateKey = {
  rat: string;
  key: string;
  values: Record<string, number>;
  message: string;
};

export type CellIdentityDuplicateSource = {
  rat?: string | null;
  details?: CellIdentityDuplicateDetails | null;
};

export const CELL_IDENTITY_DUPLICATE_SPECS: CellIdentityDuplicateSpec[] = [
  {
    rat: "GSM",
    label: "GSM",
    fields: [{ field: "lac", fallback: 0 }, { field: "cid" }],
    requiredFields: ["cid"],
    duplicateLabel: "LAC+CID",
    isUnknownWhenZero: false,
  },
  {
    rat: "UMTS",
    label: "UMTS",
    fields: [{ field: "rnc", fallback: 0 }, { field: "cid" }],
    requiredFields: ["cid"],
    duplicateLabel: "RNC+CID",
    isUnknownWhenZero: true,
  },
  {
    rat: "LTE",
    label: "LTE",
    fields: [{ field: "enbid" }, { field: "clid" }],
    requiredFields: ["enbid", "clid"],
    duplicateLabel: "eNBID+CLID",
    isUnknownWhenZero: true,
  },
  {
    rat: "NR",
    label: "NR",
    fields: [{ field: "nci" }],
    requiredFields: ["nci"],
    duplicateLabel: "NCI",
    isUnknownWhenZero: true,
    identityDetails: (details) => ({ nci: nrCellIdentity(details) }),
  },
];

const NCI_BITS = 36;

function nrCellIdentity({ gnbid, clid, gnbid_length: length = DEFAULT_GNBID_LENGTH }: CellIdentityDuplicateDetails): number | undefined {
  if (typeof gnbid !== "number" || gnbid === 0 || typeof clid !== "number" || typeof length !== "number") return undefined;
  return gnbid * 2 ** (NCI_BITS - length) + clid;
}

export function getCellIdentityDuplicateSpec(rat: string | null | undefined): CellIdentityDuplicateSpec | undefined {
  if (!rat) return undefined;
  return CELL_IDENTITY_DUPLICATE_SPECS.find((spec) => spec.rat === rat);
}

export function toIdentityDetails(spec: CellIdentityDuplicateSpec, details: CellIdentityDuplicateDetails): CellIdentityDuplicateDetails {
  return spec.identityDetails?.(details) ?? details;
}

export function isUnknownCellIdentity(spec: CellIdentityDuplicateSpec, details: CellIdentityDuplicateDetails): boolean {
  return spec.isUnknownWhenZero && spec.fields.every(({ field }) => details[field] === 0);
}

export function getCellIdentityDuplicateKey(source: CellIdentityDuplicateSource): CellIdentityDuplicateKey | undefined {
  const spec = getCellIdentityDuplicateSpec(source.rat);
  if (!spec || !source.details) return undefined;
  const details = toIdentityDetails(spec, source.details);
  if (isUnknownCellIdentity(spec, details)) return undefined;

  const values: Record<string, number> = {};
  for (const field of spec.fields) {
    const value = details[field.field];
    if (typeof value === "number") values[field.field] = value;
    else if (field.fallback !== undefined) values[field.field] = field.fallback;
  }

  if (!spec.requiredFields.every((field) => values[field] !== undefined)) return undefined;

  const valueText = spec.fields.map(({ field }) => values[field]).join("+");
  return {
    rat: spec.rat,
    key: spec.fields.map(({ field }) => values[field]).join(":"),
    values,
    message: `Duplicate ${spec.duplicateLabel} (${valueText}) found in ${spec.label} cells`,
  };
}
