import { SI2PEMClient, isSI2PEMError } from "si2pem-reader";

import { ErrorResponse } from "../../errors.js";
import type { RetryHeaders } from "../../lib/requestLimit.js";

const SI2PEM_RETRY_SECONDS = 60;
const BUSY_RETRY_SECONDS = 10;

export const EMF_COUNTRY_CODE = "PL";
export const si2pem = new SI2PEMClient();

export const SI2PEM_UNAVAILABLE_REASON =
  "SI2PEM is not responding and there is no cached result to fall back on. `Retry-After` tells you how many seconds to wait.";

export class ReportReadQueueFullError extends Error {}

function serviceUnavailable(res: RetryHeaders, retrySeconds: number, message: string, cause: unknown): ErrorResponse {
  res.header("Retry-After", String(retrySeconds));
  res.header("X-Retry-After", String(retrySeconds));
  return new ErrorResponse("SERVICE_UNAVAILABLE", { message, cause });
}

export async function answerFromSi2pem<T>(res: RetryHeaders, load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof ReportReadQueueFullError) {
      throw serviceUnavailable(res, BUSY_RETRY_SECONDS, "Too many reports are being read right now. Try again in a moment.", error);
    }
    if (isSI2PEMError(error)) throw serviceUnavailable(res, SI2PEM_RETRY_SECONDS, "SI2PEM is not answering. Try again later.", error);
    throw error;
  }
}
