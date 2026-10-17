import type { OfficialSourceDefinition } from "@openbts/country-packs/sources";
import { parseArgs } from "node:util";

import { errorMessage } from "../../utils/errorMessage.js";

const RUN_KINDS = ["import", "replay", "relink"] as const;

export type ImportArguments = {
  sourceKey: string;
  datasetKeys: string[] | null;
  kind: (typeof RUN_KINDS)[number];
  apply: boolean;
  enqueue: boolean;
  localFile: { path: string; slice: string } | null;
};
export type StoredDataset = { id: number; key: string; isEnabled: boolean };

export const USAGE = [
  "usage: officialImport --source <key> [--datasets <key,key>] [--kind import|replay|relink] [--file <path> --slice <key>] [--enqueue] [--apply]",
  "without --apply the run is a dry run: it applies nothing and prints what it would change",
  "--datasets names dataset keys of the source; without it the run takes the source's enabled datasets; a relink run takes none",
  "--file imports one local file as the release of --slice of the one dataset named by --datasets, instead of discovering and downloading;",
  '  the date in the file name (YYYY-MM-DD) is its publication date; --slice "" is the slice of a dataset that has only one',
  "--enqueue queues the run for the importer service instead of running it in this process",
].join("\n");

export class UsageError extends Error {}

function isRunKind(value: string): value is ImportArguments["kind"] {
  return RUN_KINDS.some((kind) => kind === value);
}

function readOptions(args: readonly string[]) {
  try {
    return parseArgs({
      args: [...args],
      options: {
        source: { type: "string" },
        datasets: { type: "string" },
        kind: { type: "string", default: "import" },
        file: { type: "string" },
        slice: { type: "string" },
        enqueue: { type: "boolean", default: false },
        apply: { type: "boolean", default: false },
      },
    }).values;
  } catch (error) {
    throw new UsageError(errorMessage(error));
  }
}

export function parseImportArguments(args: readonly string[]): ImportArguments {
  const options = readOptions(args);
  if (!options.source) throw new UsageError("--source is required");
  if (!isRunKind(options.kind)) throw new UsageError(`--kind must be one of ${RUN_KINDS.join(", ")}`);

  const datasetKeys = options.datasets === undefined ? null : options.datasets.split(",").flatMap((key) => (key.trim() ? [key.trim()] : []));
  if (datasetKeys?.length === 0) throw new UsageError("--datasets needs at least one dataset key");
  if (options.kind === "relink" && datasetKeys !== null) throw new UsageError("a relink run takes no --datasets");
  if ((options.file === undefined) !== (options.slice === undefined)) throw new UsageError("--file and --slice go together");

  const localFile = options.file === undefined || options.slice === undefined ? null : { path: options.file, slice: options.slice };
  if (localFile !== null) {
    if (options.kind === "relink") throw new UsageError("a relink run reads no file");
    if (options.enqueue) throw new UsageError("--file cannot be queued: the importer service does not see this file");
    if (datasetKeys?.length !== 1) throw new UsageError("--file needs --datasets with the one dataset the file belongs to");
  }

  return { sourceKey: options.source, datasetKeys, kind: options.kind, apply: options.apply, enqueue: options.enqueue, localFile };
}

export function chooseDatasets(
  { kind, datasetKeys }: Pick<ImportArguments, "kind" | "datasetKeys">,
  source: OfficialSourceDefinition,
  stored: readonly StoredDataset[],
): StoredDataset[] {
  if (kind === "relink") return [];

  const readable = stored.filter((dataset) => source.datasets.some(({ key }) => key === dataset.key));
  const knownKeys = readable.map((dataset) => dataset.key).join(", ");
  if (datasetKeys === null) {
    const enabled = readable.filter((dataset) => dataset.isEnabled);
    if (enabled.length === 0) throw new UsageError(`${source.key} has no enabled dataset; name the datasets with --datasets (it has ${knownKeys})`);

    return enabled;
  }

  const unknownKeys = datasetKeys.filter((key) => !readable.some((dataset) => dataset.key === key));
  if (unknownKeys.length > 0) throw new UsageError(`${source.key} has no dataset ${unknownKeys.join(", ")}; it has ${knownKeys}`);

  return readable.filter((dataset) => datasetKeys.includes(dataset.key));
}
