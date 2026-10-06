import { readFileSync } from "node:fs";
import { basename } from "node:path";

type BoundaryInput = { data: unknown; source: string };
const MAX_SOURCE_LENGTH = 200;

export async function readBoundaryInput(file: string | undefined, url: string | undefined): Promise<BoundaryInput> {
  if (file !== undefined && url !== undefined) throw new Error("Specify only one of --file or --url");
  const input = url ?? file;
  if (input === undefined) throw new Error("Specify --file or --url");
  if (url === undefined && !/^[a-z][a-z\d+.-]*:\/\//i.test(input)) return { data: JSON.parse(readFileSync(input, "utf8")), source: basename(input) };

  let remote: URL;
  try {
    remote = new URL(input);
  } catch {
    throw new Error("--url must be a valid HTTP(S) URL");
  }
  if (remote.protocol !== "http:" && remote.protocol !== "https:") throw new Error("GeoJSON URLs must use HTTP or HTTPS");

  let response: Response;
  try {
    response = await fetch(remote, {
      redirect: "follow",
      headers: { Accept: "application/geo+json, application/json" },
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new Error("Could not download GeoJSON: connection failed or request timed out");
  }
  if (!response.ok) throw new Error(`GeoJSON download failed (HTTP ${response.status})`);
  if (response.status === 202) throw new Error("GeoJSON export is not ready: still being generated (HTTP 202); retry when the download is ready");

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error("GeoJSON download did not contain readable JSON");
  }
  const source = new URL(remote);
  source.username = "";
  source.password = "";
  source.search = "";
  source.hash = "";
  return { data, source: source.href.slice(0, MAX_SOURCE_LENGTH) };
}
