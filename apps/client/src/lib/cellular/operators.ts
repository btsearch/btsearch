export {
  getOperatorColor,
  resolveOperatorMnc,
  normalizeOperatorName,
  getMnoBrand,
  getOperatorSortIndex,
  normalizeCityForMNOName,
  TOP4_MNCS,
  MNO_BRAND,
  TMOBILE_MNC,
  isNetworksPartnerMnc,
} from "@openbts/shared/operatorUtils";

export function getOperatorTintGradient(color: string): string {
  return `linear-gradient(115deg, ${color}18 0%, ${color}08 38%, transparent 72%)`;
}

export function getOperatorHeaderTintGradient(color: string): string {
  return `linear-gradient(115deg, ${color}24 0%, ${color}0f 34%, transparent 70%)`;
}
