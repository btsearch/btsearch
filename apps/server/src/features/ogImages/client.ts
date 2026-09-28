import { ogRendererUrl } from "../../config.js";
import {
  type OGRenderOutcome,
  type OGRenderRequest,
  type OGRenderResult,
  OG_RENDER_MAX_AGE_HEADER,
  OG_RENDER_MAX_AGE_SECONDS,
  OG_RENDER_OUTCOME_HEADER,
  OG_RENDER_ROUTE,
} from "./contract.js";

const REQUEST_TIMEOUT_MS = 27_000;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const INTEGER_PATTERN = /^(?:0|[1-9]\d*)$/;

export class OGRendererClientError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "OGRendererClientError";
  }
}

function parseOutcome(value: string | null): OGRenderOutcome {
  if (value === "image" || value === "fallback") return value;
  throw new OGRendererClientError("OG renderer returned an invalid outcome");
}

function parseMaxAge(value: string | null, outcome: OGRenderOutcome): number {
  if (!value || !INTEGER_PATTERN.test(value)) throw new OGRendererClientError("OG renderer returned an invalid max age");
  const maxAgeSeconds = Number(value);
  if (maxAgeSeconds > OG_RENDER_MAX_AGE_SECONDS) throw new OGRendererClientError("OG renderer returned an excessive max age");
  const isCacheable = maxAgeSeconds > 0;
  if ((outcome === "image") !== isCacheable) throw new OGRendererClientError("OG renderer returned inconsistent cache metadata");
  return maxAgeSeconds;
}

function validateContentLength(value: string | null): void {
  if (value === null) return;
  if (!INTEGER_PATTERN.test(value) || Number(value) > MAX_IMAGE_BYTES)
    throw new OGRendererClientError("OG renderer returned an invalid content length");
}

async function cancelResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {}
}

async function rejectRendererResponse(response: Response, message: string): Promise<never> {
  await cancelResponseBody(response);
  throw new OGRendererClientError(message);
}

async function parseResponseMetadata(response: Response): Promise<{ maxAgeSeconds: number; outcome: OGRenderOutcome }> {
  try {
    const outcome = parseOutcome(response.headers.get(OG_RENDER_OUTCOME_HEADER));
    const maxAgeSeconds = parseMaxAge(response.headers.get(OG_RENDER_MAX_AGE_HEADER), outcome);
    return { maxAgeSeconds, outcome };
  } catch (error) {
    await cancelResponseBody(response);
    throw error;
  }
}

async function readImageBody(response: Response): Promise<Buffer> {
  try {
    validateContentLength(response.headers.get("content-length"));
  } catch (error) {
    await cancelResponseBody(response);
    throw error;
  }
  if (!response.body) throw new OGRendererClientError("OG renderer returned an empty response");

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      // Stream chunks must stay sequential so the byte cap is enforced before buffering the next chunk.
      // eslint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_IMAGE_BYTES) {
        // eslint-disable-next-line no-await-in-loop
        await reader.cancel();
        throw new OGRendererClientError("OG renderer response exceeded the size limit");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  if (totalBytes === 0) throw new OGRendererClientError("OG renderer returned an empty image");
  return Buffer.concat(chunks, totalBytes);
}

function createRequestSignal(externalSignal?: AbortSignal): { cleanup: () => void; signal: AbortSignal } {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(externalSignal?.reason);
  const timeout = setTimeout(() => controller.abort(new DOMException("OG renderer request timed out", "TimeoutError")), REQUEST_TIMEOUT_MS);
  timeout.unref();

  if (externalSignal?.aborted) abortFromCaller();
  else externalSignal?.addEventListener("abort", abortFromCaller, { once: true });

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", abortFromCaller);
    },
  };
}

export async function requestOGImage(request: OGRenderRequest, externalSignal?: AbortSignal): Promise<OGRenderResult> {
  const { cleanup, signal } = createRequestSignal(externalSignal);
  try {
    let response: Response;
    try {
      response = await fetch(`${ogRendererUrl}${OG_RENDER_ROUTE}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal,
      });
    } catch (error) {
      throw new OGRendererClientError("OG renderer request failed", { cause: error });
    }

    if (!response.ok) return rejectRendererResponse(response, `OG renderer returned HTTP ${response.status}`);
    if (response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "image/png")
      return rejectRendererResponse(response, "OG renderer returned an invalid content type");

    const { maxAgeSeconds, outcome } = await parseResponseMetadata(response);
    const buffer = await readImageBody(response);
    return { buffer, outcome, maxAgeSeconds };
  } finally {
    cleanup();
  }
}
