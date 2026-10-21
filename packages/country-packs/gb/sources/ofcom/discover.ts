import { type ReadContext, type Release, WHOLE_DATASET_SLICE } from "../../../core/sources.ts";

export const REGISTER_URL = "https://static.ofcom.org.uk/static/radiolicensing/html/register/WTR.csv";
const REGISTER_FILE_NAME = "WTR.csv";
const ISO_DAY_LENGTH = 10;

function dayOf(httpDate: string | null): string | null {
  const date = new Date(httpDate ?? "");
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, ISO_DAY_LENGTH);
}

export async function discoverFixedLinks(ctx: ReadContext): Promise<Release[]> {
  const response = await ctx.fetch(REGISTER_URL, { method: "HEAD", signal: ctx.signal });
  if (!response.ok) throw new Error(`Ofcom answered HTTP ${response.status} for ${REGISTER_URL}`);

  return [
    {
      coveredSlices: [WHOLE_DATASET_SLICE],
      files: [{ url: REGISTER_URL, fileName: REGISTER_FILE_NAME }],
      publishedOn: dayOf(response.headers.get("last-modified")),
    },
  ];
}
