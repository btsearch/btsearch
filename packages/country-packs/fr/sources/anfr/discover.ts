import { z } from "zod";

import type { ReadContext, Release, ReleaseFile } from "../../../core/sources.ts";
import { DEPARTMENT_SLICES } from "./departments.ts";

const DATASET_API_URL = "https://www.data.gouv.fr/api/1/datasets/donnees-sur-les-installations-radioelectriques-de-plus-de-5-watts-1/";
const EXPORT_FILE_NAME = /^(\d{4})(\d{2})(\d{2})-export-etalab-(data|ref)\.zip$/i;

const datasetSchema = z.object({ resources: z.array(z.object({ url: z.string() })) });

type MonthlyExport = { data?: ReleaseFile; reference?: ReleaseFile };

export async function discoverRadioInstallations(ctx: ReadContext): Promise<Release[]> {
  const response = await ctx.fetch(DATASET_API_URL, { signal: ctx.signal, headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`data.gouv.fr answered HTTP ${response.status} for ${DATASET_API_URL}`);

  const exportsByDate = new Map<string, MonthlyExport>();
  for (const { url } of datasetSchema.parse(await response.json()).resources) {
    const fileName = new URL(url).pathname.split("/").pop() ?? "";
    const match = EXPORT_FILE_NAME.exec(fileName);
    if (!match) continue;

    const date = `${match[1]}-${match[2]}-${match[3]}`;
    const monthly = exportsByDate.get(date) ?? {};
    monthly[match[4]!.toLowerCase() === "data" ? "data" : "reference"] = { url, fileName };
    exportsByDate.set(date, monthly);
  }

  const [newest] = [...exportsByDate]
    .flatMap(([date, { data, reference }]) => (data && reference ? [{ date, data, reference }] : []))
    .sort((a, b) => b.date.localeCompare(a.date));
  if (!newest) throw new Error(`${DATASET_API_URL} lists no export with both its data and reference archives`);

  return [{ coveredSlices: DEPARTMENT_SLICES, files: [newest.data, newest.reference], publishedOn: newest.date }];
}
