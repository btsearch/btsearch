import type { OperatorRef } from "../core/conventions.ts";

export const PLUS_PLMN = "26001";
export const TMOBILE_PLMN = "26002";
export const ORANGE_PLMN = "26003";
export const PLAY_PLMN = "26006";
const NETWORKS_PLMN = "26034";

export function isNetworksMember(operator: OperatorRef): boolean {
  return operator.sharedNetworkPlmns.includes(NETWORKS_PLMN);
}
