import { parseCliArgs } from "./cli.js";
import { logger } from "./logger.js";
import { logOperatorPlan, logParsedFiles } from "./logging.js";
import { applyOperatorPlans } from "./persistence.js";
import { buildOperatorPlan, loadOperatorIds } from "./planning.js";
import type { OperatorPlan } from "./types.js";
import { mergeParsedNames, readMnoNamesFromDeviceRegistryFile } from "./workbook.js";

export async function runMnoNameSync(args: string[]): Promise<void> {
  const options = parseCliArgs(args);
  if (!options.apply) logger.warn("Dry run only. Re-run with --apply to write changes.");

  const operatorIds = await loadOperatorIds(options.files);
  const missingOperators = options.files
    .map((file) => file.operator.name)
    .filter((name, index, names) => !operatorIds.has(name) && names.indexOf(name) === index);
  if (missingOperators.length > 0) throw new Error(`Operators not found in database: ${missingOperators.join(", ")}`);

  const parsedFiles = await Promise.all(options.files.map((file) => readMnoNamesFromDeviceRegistryFile(file)));
  logParsedFiles(parsedFiles);

  const groupedNames = mergeParsedNames(parsedFiles);
  const plans: OperatorPlan[] = [];
  for (const { operator, stationMnoNames } of groupedNames.values()) {
    const operatorId = operatorIds.get(operator.name);
    if (operatorId === undefined) throw new Error(`Operator not found in database: ${operator.name}`);
    // oxlint-disable-next-line no-await-in-loop -- plan logs and failures must remain ordered by operator
    const plan = await buildOperatorPlan(operator, operatorId, stationMnoNames);
    plans.push(plan);
    logOperatorPlan(plan);
  }

  if (!options.apply) return;

  await applyOperatorPlans(plans);
  logger.log("Applied mno_name sync.");
}
