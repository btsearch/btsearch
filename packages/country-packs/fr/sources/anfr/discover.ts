import { z } from "zod";

import type { ReadContext, Release } from "../../../core/sources.ts";
import { DEPARTMENT_SLICES } from "./departments.ts";

const DATASET_API_URL = "https://www.data.gouv.fr/api/1/datasets/donnees-sur-les-reseaux-mobiles/";
const WEEKLY_FILE_NAME = /observatoire.*?(\d{4})(\d{2})(\d{2}).*\.zip$/i;

const datasetSchema = z.object({ resources: z.array(z.object({ url: z.string() })) });

type WeeklyFile = { url: string; fileName: string; publishedOn: string };

function weeklyFileOf(url: string): WeeklyFile | null {
  const fileName = new URL(url).pathname.split("/").pop() ?? "";
  const date = WEEKLY_FILE_NAME.exec(fileName);
  return date ? { url, fileName, publishedOn: `${date[1]}-${date[2]}-${date[3]}` } : null;
}

export async function discoverMobileNetworks(ctx: ReadContext): Promise<Release[]> {
  const response = await ctx.fetch(DATASET_API_URL, { signal: ctx.signal, headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`data.gouv.fr answered HTTP ${response.status} for ${DATASET_API_URL}`);

  const { resources } = datasetSchema.parse(await response.json());
  const newest = resources
    .flatMap(({ url }) => weeklyFileOf(url) ?? [])
    .sort((a, b) => b.publishedOn.localeCompare(a.publishedOn))
    .at(0);
  if (!newest) throw new Error(`${DATASET_API_URL} lists no weekly mobile networks file`);

  return [{ coveredSlices: DEPARTMENT_SLICES, files: [{ url: newest.url, fileName: newest.fileName }], publishedOn: newest.publishedOn }];
}
