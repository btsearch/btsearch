import type { OfficialSourceDefinition } from "@openbts/country-packs/sources";
import { describe, expect, it } from "vitest";

import {
  type ImportArguments,
  type StoredDataset,
  UsageError,
  chooseDatasets,
  parseImportArguments,
} from "../../../src/scripts/officialImport/arguments.js";

const DEFAULTS: ImportArguments = { sourceKey: "pl-uke", datasetKeys: null, kind: "import", apply: false, enqueue: false, localFile: null };

const source = {
  key: "pl-uke",
  datasets: [{ key: "permits" }, { key: "device-registry" }, { key: "microwave-links" }],
} as unknown as OfficialSourceDefinition;

const stored: StoredDataset[] = [
  { id: 1, key: "permits", isEnabled: true },
  { id: 2, key: "device-registry", isEnabled: false },
  { id: 3, key: "microwave-links", isEnabled: true },
  { id: 4, key: "retired", isEnabled: true },
];

describe("the arguments of officialImport", () => {
  it.each<[string, Partial<ImportArguments>]>([
    ["--source pl-uke", {}],
    ["--source pl-uke --apply", { apply: true }],
    ["--source=pl-uke --datasets permits", { datasetKeys: ["permits"] }],
    ["--source pl-uke --datasets permits,device-registry, --apply", { datasetKeys: ["permits", "device-registry"], apply: true }],
    ["--source pl-uke --kind replay --datasets microwave-links", { kind: "replay", datasetKeys: ["microwave-links"] }],
    ["--source pl-uke --kind relink --enqueue --apply", { kind: "relink", enqueue: true, apply: true }],
    ["--source pl-uke --enqueue", { enqueue: true }],
    [
      "--source pl-uke --datasets device-registry --file downloads/2026-10-01_orange.xlsx --slice orange",
      { datasetKeys: ["device-registry"], localFile: { path: "downloads/2026-10-01_orange.xlsx", slice: "orange" } },
    ],
    [
      "--source pl-uke --datasets microwave-links --file links.xlsx --slice= --kind replay --apply",
      { datasetKeys: ["microwave-links"], localFile: { path: "links.xlsx", slice: "" }, kind: "replay", apply: true },
    ],
  ])("%s", (commandLine, expected) => {
    expect(parseImportArguments(commandLine.split(" "))).toEqual({ ...DEFAULTS, ...expected });
  });

  it("takes an empty --slice value given as its own argument", () => {
    const parsed = parseImportArguments(["--source", "pl-uke", "--datasets", "microwave-links", "--file", "links.xlsx", "--slice", ""]);

    expect(parsed.localFile).toEqual({ path: "links.xlsx", slice: "" });
  });

  it.each<[string, string]>([
    ["", "--source is required"],
    ["--apply", "--source is required"],
    ["--source pl-uke --kind remap", "--kind must be one of import, replay, relink"],
    ["--source pl-uke --datasets ,", "--datasets needs at least one dataset key"],
    ["--source pl-uke --kind relink --datasets permits", "a relink run takes no --datasets"],
    ["--source pl-uke --datasets permits --file permits.xlsx", "--file and --slice go together"],
    ["--source pl-uke --datasets permits --slice LTE:800:commercial", "--file and --slice go together"],
    ["--source pl-uke --kind relink --file permits.xlsx --slice x", "a relink run reads no file"],
    [
      "--source pl-uke --datasets permits --file permits.xlsx --slice x --enqueue",
      "--file cannot be queued: the importer service does not see this file",
    ],
    ["--source pl-uke --file permits.xlsx --slice x", "--file needs --datasets with the one dataset the file belongs to"],
    [
      "--source pl-uke --datasets permits,device-registry --file a.xlsx --slice x",
      "--file needs --datasets with the one dataset the file belongs to",
    ],
    ["--source pl-uke --dry-run", "Unknown option '--dry-run'"],
    ["--source pl-uke permits", "Unexpected argument 'permits'"],
    ["--source", "Option '--source <value>' argument missing"],
  ])("refuses `%s`: %s", (commandLine, message) => {
    const parse = () => parseImportArguments(commandLine === "" ? [] : commandLine.split(" "));

    expect(parse).toThrow(UsageError);
    expect(parse).toThrow(message);
  });
});

describe("the datasets of a run", () => {
  it.each<[string, Pick<ImportArguments, "kind" | "datasetKeys">, number[]]>([
    ["the source's enabled datasets that the code can read, when none is named", { kind: "import", datasetKeys: null }, [1, 3]],
    ["the named datasets, a switched-off one included", { kind: "import", datasetKeys: ["device-registry", "permits"] }, [1, 2]],
    ["the named datasets of a replay", { kind: "replay", datasetKeys: ["microwave-links"] }, [3]],
    ["none for a relink", { kind: "relink", datasetKeys: null }, []],
  ])("are %s", (_case, options, expectedIds) => {
    expect(chooseDatasets(options, source, stored).map((dataset) => dataset.id)).toEqual(expectedIds);
  });

  it.each<[string, Pick<ImportArguments, "kind" | "datasetKeys">, StoredDataset[], string]>([
    [
      "a dataset the source does not have",
      { kind: "import", datasetKeys: ["permits", "towers"] },
      stored,
      "pl-uke has no dataset towers; it has permits, device-registry, microwave-links",
    ],
    [
      "a dataset the code no longer reads",
      { kind: "import", datasetKeys: ["retired"] },
      stored,
      "pl-uke has no dataset retired; it has permits, device-registry, microwave-links",
    ],
    [
      "a source with every dataset switched off and none named",
      { kind: "import", datasetKeys: null },
      [{ id: 2, key: "device-registry", isEnabled: false }],
      "pl-uke has no enabled dataset; name the datasets with --datasets (it has device-registry)",
    ],
  ])("refuse %s", (_case, options, storedDatasets, message) => {
    const choose = () => chooseDatasets(options, source, storedDatasets);

    expect(choose).toThrow(UsageError);
    expect(choose).toThrow(message);
  });
});
