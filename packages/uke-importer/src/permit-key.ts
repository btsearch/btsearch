import type { UkePermitKeyInput } from "./permit-types.js";

export type { UkePermitKeyInput } from "./permit-types.js";

export function getUkePermitKey(permit: UkePermitKeyInput): string {
  return `${permit.uke_station_id}|${permit.band_id}|${permit.decision_number}|${permit.decision_type}|${permit.expiry_date.toISOString()}`;
}
