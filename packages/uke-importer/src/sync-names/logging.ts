import path from "node:path";

import { PREVIEW_LIMIT, logger } from "./logger.js";
import type { OperatorPlan, ParsedMnoNames } from "./types.js";

export function logParsedFiles(parsedFiles: ParsedMnoNames[]): void {
  for (const parsed of parsedFiles) {
    logger.log(
      `${parsed.operator.name}: ${path.basename(parsed.filePath)} (${parsed.sheetName}) -> ${parsed.stationMnoNames.size} station names from ${parsed.rowCount} rows`,
    );

    if (parsed.conflicts.length > 0) {
      logger.warn(`${parsed.operator.name}: ${parsed.conflicts.length} duplicate station ids had conflicting names; kept first value`);
      for (const conflict of parsed.conflicts.slice(0, PREVIEW_LIMIT)) {
        logger.warn(`  ${conflict.stationId}: "${conflict.first}" vs "${conflict.next}"`);
      }
    }
  }
}

export function logOperatorPlan(plan: OperatorPlan): void {
  logger.log(
    [
      `${plan.operator.name}:`,
      `${plan.inputStationCount} names from files`,
      `${plan.matchedStationCount} matched internal stations`,
      `${plan.inserts.length} inserts`,
      `${plan.updates.length} updates`,
      `${plan.unchangedCount} unchanged`,
      `${plan.missingStationIds.length} missing internal stations`,
    ].join(" "),
  );

  for (const change of plan.preview) {
    logger.log(`  ${change.action} ${change.stationId}: ${change.oldMnoName ?? "-"} -> ${change.newMnoName}`);
  }

  if (plan.preview.length === PREVIEW_LIMIT) logger.log(`  ...preview limited to ${PREVIEW_LIMIT} changes`);
  if (plan.missingStationIds.length > 0) logger.warn(`  missing sample: ${plan.missingStationIds.slice(0, PREVIEW_LIMIT).join(", ")}`);
}
