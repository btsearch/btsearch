import { useTranslation } from "react-i18next";

export type TerrainFormat = {
  decimal: (value: number, fractionDigits: number) => string;
  compact: (value: number, maximumFractionDigits: number) => string;
  signed: (value: number, fractionDigits: number) => string;
  day: (day: string) => string;
};

type SignDisplay = "auto" | "exceptZero";

const formatsByLanguage = new Map<string, TerrainFormat>();

function createTerrainFormat(language: string): TerrainFormat {
  const numberFormats = new Map<string, Intl.NumberFormat>();
  const dayFormat = new Intl.DateTimeFormat(language, { dateStyle: "medium", timeZone: "UTC" });

  function getNumberFormat(minimumFractionDigits: number, maximumFractionDigits: number, signDisplay: SignDisplay): Intl.NumberFormat {
    const cacheKey = `${minimumFractionDigits}:${maximumFractionDigits}:${signDisplay}`;
    let numberFormat = numberFormats.get(cacheKey);
    if (numberFormat === undefined) {
      numberFormat = new Intl.NumberFormat(language, { minimumFractionDigits, maximumFractionDigits, signDisplay, useGrouping: false });
      numberFormats.set(cacheKey, numberFormat);
    }
    return numberFormat;
  }

  function decimal(value: number, fractionDigits: number) {
    return getNumberFormat(fractionDigits, fractionDigits, "auto").format(value);
  }

  function compact(value: number, maximumFractionDigits: number) {
    return getNumberFormat(0, maximumFractionDigits, "auto").format(value);
  }

  function signed(value: number, fractionDigits: number) {
    return getNumberFormat(fractionDigits, fractionDigits, "exceptZero").format(value);
  }

  function day(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : dayFormat.format(date);
  }

  return { decimal, compact, signed, day };
}

function getTerrainFormat(language: string): TerrainFormat {
  let format = formatsByLanguage.get(language);
  if (format === undefined) {
    format = createTerrainFormat(language);
    formatsByLanguage.set(language, format);
  }
  return format;
}

export function useTerrainFormat(): TerrainFormat {
  const { i18n } = useTranslation();
  return getTerrainFormat(i18n.language);
}
