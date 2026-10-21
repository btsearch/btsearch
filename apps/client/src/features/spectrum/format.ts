import type { TFunction } from "i18next";

import type { KhzRange } from "./model";

const mhzFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, useGrouping: false });

export function formatMhz(khz: number): string {
  return mhzFormat.format(khz / 1000);
}

export function formatRange(t: TFunction, range: KhzRange): string {
  return t("spectrum:range", { low: formatMhz(range[0]), high: formatMhz(range[1]) });
}

export function formatWidth(t: TFunction, khz: number, isPaired: boolean): string {
  const width = formatMhz(khz);
  return isPaired ? t("spectrum:width.paired", { width }) : t("spectrum:width.mhz", { width });
}

export function formatShortWidth(t: TFunction, khz: number, isPaired: boolean): string {
  const width = formatMhz(khz);
  return isPaired ? t("spectrum:width.pairedShort", { width }) : width;
}

export function holderBackground(colors: readonly string[]): string {
  const [first = "transparent", second] = colors;
  return second === undefined ? first : `linear-gradient(${first} 50%, ${second} 50%)`;
}

export function readableTextColor(background: string): string {
  const channels = [1, 3, 5].map((start) => Number.parseInt(background.slice(start, start + 2), 16) / 255);
  const linear = channels.map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  const luminance = 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0);
  return 1.05 / (luminance + 0.05) >= (luminance + 0.05) / 0.055 ? "#ffffff" : "#0b0f12";
}

export function sourceLink(source: string): { href: string; label: string } | null {
  try {
    const url = new URL(source);
    return url.protocol === "https:" || url.protocol === "http:" ? { href: url.href, label: url.hostname.replace(/^www\./, "") } : null;
  } catch {
    return null;
  }
}
