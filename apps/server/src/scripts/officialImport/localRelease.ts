import type { LocalFile, OfficialSourceDefinition, Release } from "@openbts/country-packs/sources";
import path from "node:path";
import { pathToFileURL } from "node:url";

const FILE_NAME_DATE = /\d{4}-\d{2}-\d{2}/;

export type LocalRelease = Release & { files: readonly LocalFile[] };

export function publishedOnOf(fileName: string): string | null {
  const [day] = fileName.match(FILE_NAME_DATE) ?? [];
  if (day === undefined) return null;

  const midnight = new Date(`${day}T00:00:00.000Z`);
  return !Number.isNaN(midnight.getTime()) && midnight.toISOString().startsWith(day) ? day : null;
}

export function localReleaseOf(filePath: string, slice: string): LocalRelease {
  const absolutePath = path.resolve(filePath);
  const file: LocalFile = { url: pathToFileURL(absolutePath).href, fileName: path.basename(absolutePath), path: absolutePath };

  return { coveredSlices: [slice], files: [file], publishedOn: publishedOnOf(file.fileName) };
}

export function withLocalRelease(source: OfficialSourceDefinition, datasetKey: string, release: Release): OfficialSourceDefinition {
  return {
    ...source,
    datasets: source.datasets.map((dataset) => (dataset.key === datasetKey ? { ...dataset, discover: () => Promise.resolve([release]) } : dataset)),
  };
}
