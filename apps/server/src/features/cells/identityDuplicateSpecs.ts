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
  },
  {
    rat: "UMTS",
    label: "UMTS",
    fields: [{ field: "rnc", fallback: 0 }, { field: "cid" }],
    requiredFields: ["cid"],
    duplicateLabel: "RNC+CID",
  },
  {
    rat: "LTE",
    label: "LTE",
    fields: [{ field: "enbid" }, { field: "clid" }],
    requiredFields: ["enbid", "clid"],
    duplicateLabel: "eNBID+CLID",
  },
];

export function getCellIdentityDuplicateSpec(rat: string | null | undefined): CellIdentityDuplicateSpec | undefined {
  if (!rat) return undefined;
  return CELL_IDENTITY_DUPLICATE_SPECS.find((spec) => spec.rat === rat);
}

export function getCellIdentityDuplicateKey(source: CellIdentityDuplicateSource): CellIdentityDuplicateKey | undefined {
  const spec = getCellIdentityDuplicateSpec(source.rat);
  if (!spec || !source.details) return undefined;

  const values: Record<string, number> = {};
  for (const field of spec.fields) {
    const value = source.details[field.field];
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
