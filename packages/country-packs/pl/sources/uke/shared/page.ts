import type { ReadContext, Release } from "../../../../core/sources.ts";
import { publishedOnFromFileName } from "./dates.ts";

export type PageLink = { url: string; text: string; fileName: string };

export async function listXlsxLinks(ctx: ReadContext, pageUrl: string): Promise<PageLink[]> {
  const response = await ctx.fetch(pageUrl, { signal: ctx.signal });
  if (!response.ok) throw new Error(`UKE page ${pageUrl} answered HTTP ${response.status}`);

  const { load } = await import("cheerio");
  const $ = load(await response.text());
  const links: PageLink[] = [];
  $("ul.files li .part a").each((_, element) => {
    const href = $(element).attr("href") || "";
    if (!href.toLowerCase().endsWith(".xlsx")) return;

    const url = new URL(href, pageUrl).toString();
    links.push({ url, text: $(element).text().trim(), fileName: url.split("/").pop() ?? "" });
  });

  return links;
}

export function releaseOf(link: PageLink, slice: string): Release {
  return { coveredSlices: [slice], files: [{ url: link.url, fileName: link.fileName }], publishedOn: publishedOnFromFileName(link.fileName) };
}

export function noUsableFileError(pageUrl: string): Error {
  return new Error(`UKE page ${pageUrl} lists no usable file`);
}
