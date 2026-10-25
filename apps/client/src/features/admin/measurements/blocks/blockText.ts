import type {
  CellRat,
  MeasurementDeviceModel,
  MeasurementReaderVersion,
  MeasurementReadingBlock,
  MeasurementReadingBlockCreate,
  MeasurementSoc,
} from "@openbts/shared/contract";
import type { TFunction } from "i18next";

import type { ReaderQuirkFlag } from "../api/readingBlocks";
import { getDeviceModelName } from "../components/deviceModelPicker";

export type ReadingBlockPhones = MeasurementReadingBlock["phones"];
export type ReadingBlockField = NonNullable<MeasurementReadingBlockCreate["fields"]>[number];
export type ReadingBlockRole = NonNullable<MeasurementReadingBlockCreate["roles"]>[number];
export type PhonesKind = "modemFamily" | "soc" | "deviceModel" | "readerVersion";

export type BlockLookups = {
  socs: ReadonlyMap<number, MeasurementSoc>;
  models: ReadonlyMap<number, MeasurementDeviceModel>;
  readerVersions: ReadonlyMap<number, MeasurementReaderVersion>;
};

type ScopedBlock = Pick<MeasurementReadingBlock, "fields" | "technologies" | "roles" | "sdkIntMin" | "sdkIntMax" | "radioVersionPrefix">;

export function getPhonesKind(phones: ReadingBlockPhones): PhonesKind {
  if ("modemFamily" in phones) return "modemFamily";
  if ("socId" in phones) return "soc";
  if ("deviceModelId" in phones) return "deviceModel";
  return "readerVersion";
}

export function getSourceLabel(t: TFunction, source: MeasurementReaderVersion["source"]): string {
  return t(`measurements.blocks.sources.${source}`);
}

export function getReaderVersionName(t: TFunction, readerVersion: MeasurementReaderVersion): string {
  return t("measurements.blocks.phones.readerVersion", {
    reader: readerVersion.reader,
    version: readerVersion.version,
    source: getSourceLabel(t, readerVersion.source),
  });
}

export function getPhonesName(t: TFunction, phones: ReadingBlockPhones, lookups: BlockLookups): string {
  if ("modemFamily" in phones) {
    if (phones.modemFamily === "other") return t("measurements.blocks.phones.otherModemFamily");
    return t("measurements.blocks.phones.modemFamily", { family: t(`measurements.blocks.modemFamilies.${phones.modemFamily}`) });
  }
  if ("socId" in phones) {
    const soc = lookups.socs.get(phones.socId);
    return soc === undefined
      ? t("measurements.blocks.phones.unknownSoc", { id: phones.socId })
      : t("measurements.blocks.phones.soc", { name: soc.model });
  }
  if ("deviceModelId" in phones) {
    const model = lookups.models.get(phones.deviceModelId);
    return model === undefined ? t("measurements.blocks.phones.unknownModel", { id: phones.deviceModelId }) : getDeviceModelName(model);
  }
  const readerVersion = lookups.readerVersions.get(phones.readerVersionId);
  return readerVersion === undefined
    ? t("measurements.blocks.phones.unknownReaderVersion", { id: phones.readerVersionId })
    : getReaderVersionName(t, readerVersion);
}

function joinList(items: readonly string[], locale: string): string {
  return new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(items);
}

export function getRatLabel(rat: CellRat): string {
  return rat.toUpperCase();
}

function getSdkText(t: TFunction, block: ScopedBlock): string | null {
  const { sdkIntMin: min, sdkIntMax: max } = block;
  if (min !== null && max !== null) return t("measurements.blocks.scope.sdkRange", { min, max });
  if (min !== null) return t("measurements.blocks.scope.sdkFrom", { min });
  if (max !== null) return t("measurements.blocks.scope.sdkTo", { max });
  return null;
}

export function getScopeText(t: TFunction, block: ScopedBlock, locale: string): string {
  const parts: string[] = [];
  if (block.fields === null) {
    parts.push(t("measurements.blocks.scope.wholeReadings"));
  } else {
    parts.push(
      joinList(
        block.fields.map((field) => t(`measurements.blocks.fieldNames.${field}`)),
        locale,
      ),
    );
    if (block.technologies === null && block.roles === null) {
      parts.push(t("measurements.blocks.scope.allTechnologiesAndRoles"));
    } else {
      parts.push(
        block.technologies === null ? t("measurements.blocks.scope.allTechnologies") : joinList(block.technologies.map(getRatLabel), locale),
      );
      parts.push(
        block.roles === null
          ? t("measurements.blocks.scope.allRoles")
          : joinList(
              block.roles.map((role) => t(`measurements.blocks.roleNames.${role}`)),
              locale,
            ),
      );
    }
  }

  const sdkText = getSdkText(t, block);
  if (sdkText !== null) parts.push(sdkText);
  if (block.radioVersionPrefix !== null) parts.push(t("measurements.blocks.scope.radioVersion", { prefix: block.radioVersionPrefix }));
  const text = parts.join(", ");
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

function getFlagSubject(flag: ReaderQuirkFlag): string {
  const { deviceModel, readerVersion } = flag.evidence;
  if (deviceModel !== null) return getDeviceModelName(deviceModel);
  return readerVersion === null ? "" : `${readerVersion.reader} ${readerVersion.version}`;
}

function getFlagTitleKey(flag: ReaderQuirkFlag): string {
  const { pattern, parameter } = flag.evidence;
  if (pattern === "bytesSwapped") return "bytesSwapped";
  if (pattern === "factor") return parameter !== null && parameter < 0 ? "divided" : "multiplied";
  return pattern;
}

function getFlagParameter(flag: ReaderQuirkFlag, locale: string): string {
  const { pattern, parameter } = flag.evidence;
  if (parameter === null) return "";
  return (pattern === "factor" ? Math.abs(parameter) : parameter).toLocaleString(locale);
}

export function getFlagTitle(t: TFunction, flag: ReaderQuirkFlag, locale: string): string {
  return t(`measurements.blocks.flags.titles.${getFlagTitleKey(flag)}`, {
    subject: getFlagSubject(flag),
    field: t(`measurements.blocks.fieldNames.${flag.evidence.field}`),
    parameter: getFlagParameter(flag, locale),
  });
}

export function getFlagMeta(t: TFunction, flag: ReaderQuirkFlag): string {
  const { valueCount, cellCount, uploadCount } = flag.evidence;
  return t("measurements.blocks.flags.meta", {
    values: t("measurements.blocks.flags.values", { count: valueCount }),
    cells: t("measurements.blocks.flags.cells", { count: cellCount }),
    uploads: t("measurements.blocks.flags.uploads", { count: uploadCount }),
    id: flag.id,
  });
}
