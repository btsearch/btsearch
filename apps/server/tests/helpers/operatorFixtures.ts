export function operatorRow(id: number, mnc: number | null, countryCode = "PL") {
  return { id, countryCode, brandId: null, name: `Operator ${id}`, full_name: `Operator ${id} SA`, shortCode: null, sortPriority: null, mnc };
}

export function primaryPlmn(operatorId: number, code: string) {
  return { operatorId, mcc: code.slice(0, 3), mnc: code.slice(3), code, role: "primary" };
}
