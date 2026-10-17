export function formatPermitLabel(label: { rat: string; mhz: number; variant: string }): string {
  return label.variant === "railway" ? `GSM-R ${label.mhz}` : `${label.rat} ${label.mhz}`;
}
