import type { ReadContext } from "@openbts/country-packs/sources";

import { logger } from "../../../utils/logger.js";
import { PAGE_TIMEOUT_MS } from "./config.js";
import { timedFetch } from "./download.js";
import type { RunScope } from "./types.js";

export function readContextOf(scope: RunScope, datasetKey: string, skip: ReadContext["skip"]): ReadContext {
  return {
    fetch: timedFetch(scope.signal, PAGE_TIMEOUT_MS),
    signal: scope.signal,
    now: scope.run.startedAt,
    log: (message) => logger.info("official.import", { runId: scope.run.id, source: scope.source.key, dataset: datasetKey, message }),
    skip,
  };
}
