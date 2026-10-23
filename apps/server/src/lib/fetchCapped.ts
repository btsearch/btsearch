const FETCH_TIMEOUT_MS = 15_000;

export async function fetchCapped(url: string, maxBytes: number): Promise<Buffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok || !response.body) throw new Error(`${url} answered ${response.status}`);

  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > maxBytes) throw new Error(`${url} is larger than ${maxBytes} bytes`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
