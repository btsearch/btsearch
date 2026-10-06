const MCC_PATTERN = /^[1-9]\d{2}$/;
const MNC_PATTERN = /^\d{2,3}$/;

export const MCC_LENGTH = 3;
export const MNC_MAX_LENGTH = 3;

export function isMcc(text: string): boolean {
  return MCC_PATTERN.test(text);
}

export function isMnc(text: string): boolean {
  return MNC_PATTERN.test(text);
}

export function toPlmn(mcc: string, mnc: string): string {
  return `${mcc}${mnc}`;
}

export function formatPlmn(plmn: string): string {
  if (plmn.length <= MCC_LENGTH) return plmn;
  return `${plmn.slice(0, MCC_LENGTH)} ${plmn.slice(MCC_LENGTH)}`;
}
