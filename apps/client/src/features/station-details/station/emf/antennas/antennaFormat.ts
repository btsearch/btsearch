import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { toEmfReportDate } from "../reports";
import type { EmfAntenna } from "../types";
import { type AntennaGroup, type TiltRange, getAntennaGroupKind } from "./antennaModel";

type AntennaFormat = {
  decimal: (value: number) => string;
  degrees: (value: number | null) => string;
  meters: (value: number) => string;
  watts: (value: number | null) => string;
  frequency: (value: number) => string;
  longDate: (day: string | null) => string;
  shortDate: (day: string | null) => string;
  conjunction: (items: readonly string[]) => string;
};

const EMPTY_VALUE = "-";
const MAX_FRACTION_DIGITS = 2;

const formatsByLanguage = new Map<string, AntennaFormat>();

function createAntennaFormat(language: string): AntennaFormat {
  const decimalFormat = new Intl.NumberFormat(language, { maximumFractionDigits: MAX_FRACTION_DIGITS });
  const ungroupedFormat = new Intl.NumberFormat(language, { maximumFractionDigits: MAX_FRACTION_DIGITS, useGrouping: false });
  const longDateFormat = new Intl.DateTimeFormat(language, { dateStyle: "long" });
  const shortDateFormat = new Intl.DateTimeFormat(language, { day: "numeric", month: "short", year: "numeric" });
  const conjunctionFormat = new Intl.ListFormat(language, { style: "long", type: "conjunction" });

  function decimal(value: number) {
    return decimalFormat.format(value);
  }

  function degrees(value: number | null) {
    return value === null ? EMPTY_VALUE : `${decimalFormat.format(value)}°`;
  }

  function meters(value: number) {
    return `${decimalFormat.format(value)} m`;
  }

  function watts(value: number | null) {
    return value === null ? EMPTY_VALUE : `${decimalFormat.format(value)} W`;
  }

  function frequency(value: number) {
    return ungroupedFormat.format(value);
  }

  function longDate(day: string | null) {
    return day === null ? EMPTY_VALUE : longDateFormat.format(toEmfReportDate(day));
  }

  function shortDate(day: string | null) {
    return day === null ? EMPTY_VALUE : shortDateFormat.format(toEmfReportDate(day));
  }

  function conjunction(items: readonly string[]) {
    return conjunctionFormat.format(items);
  }

  return { decimal, degrees, meters, watts, frequency, longDate, shortDate, conjunction };
}

function getAntennaFormat(language: string): AntennaFormat {
  let format = formatsByLanguage.get(language);
  if (format === undefined) {
    format = createAntennaFormat(language);
    formatsByLanguage.set(language, format);
  }
  return format;
}

export function useAntennaFormat(): AntennaFormat {
  const { i18n } = useTranslation();
  return getAntennaFormat(i18n.language);
}

export function getGroupTitle(group: AntennaGroup, format: AntennaFormat, t: TFunction): string {
  if (group.kind === "omnidirectional") return t("stationDetails:si2pemAntennaData.groups.omnidirectional");
  if (group.kind === "undirected") return t("stationDetails:si2pemAntennaData.groups.undirected");
  return format.degrees(group.azimuth);
}

export function getGroupDirectionName(group: AntennaGroup, format: AntennaFormat, t: TFunction): string {
  const title = getGroupTitle(group, format, t);
  return group.kind === "azimuth" ? t("stationDetails:si2pemAntennaData.direction", { direction: title }) : title;
}

export function getTiltRangeText(range: TiltRange, format: AntennaFormat, t: TFunction): string {
  if (range.min === range.max) return t("stationDetails:si2pemAntennaData.tilt.fixed");

  const min = format.decimal(range.min);
  const max = format.decimal(range.max);
  if (range.min < 0 || range.max < 0) return t("stationDetails:si2pemAntennaData.tilt.between", { min, max });
  return `${min}-${max}°`;
}

function getAntennaDirectionText(azimuth: number | null, format: AntennaFormat, t: TFunction): string | null {
  const kind = getAntennaGroupKind(azimuth);
  if (kind === "undirected") return null;
  return kind === "omnidirectional" ? t("stationDetails:si2pemAntennaData.comparison.omnidirectional") : format.degrees(azimuth);
}

export function getAntennaSummary(antenna: EmfAntenna, format: AntennaFormat, t: TFunction): string {
  const model = antenna.model ?? t("stationDetails:si2pemAntennaData.unknownModel");
  const name = [antenna.manufacturer, model].filter(Boolean).join(" ");
  const facts = [getAntennaDirectionText(antenna.azimuth, format, t), format.meters(antenna.heightMeters)].filter(Boolean).join(", ");
  return `${name} (${facts})`;
}
