import { z } from "zod/v4";

import {
  AT_LEAST_ONE_FIELD_ISSUE,
  booleanQuerySchema,
  countryCodeSchema,
  csvCountryCodesSchema,
  csvEnumSchema,
  csvIdsSchema,
  csvSchema,
  cursorSchema,
  hasAnyField,
  idParamSchema,
  idSchema,
  limitSchema,
  pagingSchema,
  userRefSchema,
} from "./common.ts";
import { IMPORT_CHANGE_KINDS, IMPORT_RUN_STEPS, IMPORT_SLICE_OUTCOMES } from "./constants.ts";

export const OFFICIAL_LAYERS = ["sites", "microwaveLinks"] as const;
export type OfficialLayer = (typeof OFFICIAL_LAYERS)[number];

export const IMPORT_RUN_KINDS = ["import", "replay", "remap", "relink"] as const;
export type ImportRunKind = (typeof IMPORT_RUN_KINDS)[number];

export const STARTABLE_IMPORT_RUN_KINDS = ["import", "replay", "relink"] as const satisfies readonly ImportRunKind[];

export const IMPORT_RUN_TRIGGERS = ["scheduled", "manual", "cli"] as const;
export type ImportRunTrigger = (typeof IMPORT_RUN_TRIGGERS)[number];

export const IMPORT_RUN_STATUSES = ["queued", "running", "done", "failed", "cancelled"] as const;
export type ImportRunStatus = (typeof IMPORT_RUN_STATUSES)[number];

const SOURCE_KEY_MAX_LENGTH = 64;
const MAX_LICENSEE_LIST_LIMIT = 1000;
const SLICE_KEY_MAX_LENGTH = 64;
export const LONGEST_CHECK_INTERVAL_HOURS = 32_767;
const RUN_DATASET_LIMIT = 100;
const RUN_APPROVAL_LIMIT = 500;

const sourceKeySchema = z.string().min(1).max(SOURCE_KEY_MAX_LENGTH);
const sliceKeySchema = z.string().max(SLICE_KEY_MAX_LENGTH);
const releaseSha256Schema = z.string().regex(/^[0-9a-f]{64}$/, "Must be a SHA-256 hash written as 64 lower-case hexadecimal characters");
export const csvSourceKeysSchema = csvSchema.pipe(z.array(sourceKeySchema).min(1).max(100)).describe("Comma-separated source keys");
const countSchema = z.number().int().nonnegative();

const ADMINISTRATORS_ONLY_NOTE = "Only returned to administrators";
const SLICE_NOTE = "A slice is the part of a dataset that one release covers completely, for example one band or one operator";
const SLICE_KEY_NOTE = "The slice's key within its dataset. It is empty for a dataset that is published as a whole";
const RELEASE_SHA256_NOTE =
  "A release is the file, or the set of files, that the authority puts out together. " +
  "This is the SHA-256 hash that identifies its content, as 64 hexadecimal characters";
const SOURCE_ENABLED_NOTE = "Whether imports of the source run on schedule. A run you start yourself is not affected";
const SOURCE_VISIBLE_NOTE = "Whether public responses include the source's data. It can only be `true` for a source whose terms allow redistribution";
const DATASET_ENABLED_NOTE =
  "Whether the dataset is imported. `false` pauses this dataset alone: scheduled imports leave it out, " +
  "and so does a run you start without naming its datasets";
const CHECK_EVERY_HOURS_NOTE = "How often, in hours, a scheduled import checks the dataset for a new release";
const HOLD_SHRINK_PERCENT_NOTE =
  "A slice is held instead of applied when a release has more than this percentage fewer records for it than are stored. " +
  "A release without any record for a slice is held too, unless nothing is stored for it either";
const DRY_RUN_NOTE = "A dry run works out what the run would change and then undoes it, so nothing is changed and no notifications are sent";
const RUN_KIND_NOTE =
  "`import` reads what the source has published and applies what is new. " +
  "`replay` reads the latest release of each dataset again, even when it was imported before. " +
  "`relink` works out the links between official permits and stations again, without reading a dataset";
const REMAP_KIND_NOTE = "`remap` moves the official sites and permits of a licensee to another operator";
const CHANGE_KIND_NOTE =
  "`siteAdded`, `siteMoved`, `siteRemapped`: an official site is new, moved to another location, or went to another operator. " +
  "`permitAdded`: a permit is new. `permitListed`, `permitUnlisted`: a dataset started or stopped listing a permit that already existed. " +
  "`permitArchived`: no dataset lists the permit any more, so it was removed. " +
  "`stationLinked`, `stationUnlinked`: a permit was linked to a station, or the link was removed. " +
  "`microwaveLinkAdded`, `microwaveLinkRenewed`, `microwaveLinkArchived`: a microwave link is new, continues under a new permit number, " +
  "or was removed";
const SLICE_OUTCOME_NOTE =
  "`applied`: the release was applied. `unchanged`: the release is the one that was imported last, so it was not read. " +
  "`held`: the release was not applied because it has no records for the slice, " +
  "or because it would shrink the slice by more than the dataset's `holdShrinkPercent`. " +
  "To apply it anyway, start a run that names the slice in `approvals`";
const RELEASE_RECORD_COUNT_NOTE = "The number of records the release has for the slice, not counting the skipped ones";
const STORED_RECORD_COUNT_NOTE = "The number of records that were stored for the slice before the release was applied";
const SKIP_REASON_NOTE =
  "Why the records were skipped. The values come from the import and from each source's reader, " +
  "for example `unmappedLicensee` (the licensee is not mapped to an operator), `unknownRegion` and `badCoordinates`";
const LICENSEE_OPERATOR_NOTE = "The operator the licensee is mapped to";
const LICENSEE_BRAND_NOTE =
  "The licensee's own brand. Only a licensee without an operator has one, because a licensee with an operator uses the operator's brand";

export const officialDatasetSliceSchema = z.object({
  key: z.string().describe(SLICE_KEY_NOTE),
  importedAt: z.iso.datetime().nullable().describe("When the slice was last imported"),
  releaseSha256: z.string().nullable().describe(`The release that was imported last. ${RELEASE_SHA256_NOTE}`),
});
export type OfficialDatasetSlice = z.infer<typeof officialDatasetSliceSchema>;

export const officialDatasetSchema = z.object({
  id: idSchema,
  sourceKey: z.string(),
  key: z.string().describe("Unique within its source"),
  layer: z
    .enum(OFFICIAL_LAYERS)
    .describe("What the dataset holds: `sites` for official sites with their permits, `microwaveLinks` for microwave links"),
  importedAt: z.iso.datetime().nullable().describe("When the dataset was last imported: the latest `importedAt` of its slices"),
  isEnabled: z.boolean().optional().describe(`${DATASET_ENABLED_NOTE}. ${ADMINISTRATORS_ONLY_NOTE}`),
  checkEveryHours: z.number().int().positive().optional().describe(`${CHECK_EVERY_HOURS_NOTE}. ${ADMINISTRATORS_ONLY_NOTE}`),
  nextCheckAt: z.iso
    .datetime()
    .nullable()
    .optional()
    .describe(`When the schedule next checks the dataset. \`null\` means at the next opportunity. ${ADMINISTRATORS_ONLY_NOTE}`),
  holdShrinkPercent: z
    .number()
    .int()
    .nullable()
    .optional()
    .describe(`${HOLD_SHRINK_PERCENT_NOTE}. \`null\` means the default, which is in \`defaultHoldShrinkPercent\`. ${ADMINISTRATORS_ONLY_NOTE}`),
  defaultHoldShrinkPercent: z
    .number()
    .int()
    .optional()
    .describe(`The percentage that applies while \`holdShrinkPercent\` is \`null\`. ${ADMINISTRATORS_ONLY_NOTE}`),
  slices: z
    .array(officialDatasetSliceSchema)
    .optional()
    .describe(`The dataset's slices, each with what was last imported for it. ${SLICE_NOTE}. ${ADMINISTRATORS_ONLY_NOTE}`),
});
export type OfficialDataset = z.infer<typeof officialDatasetSchema>;

export const officialSourceSchema = z.object({
  key: z.string().describe("Identifies the source in paths and filters"),
  countryCode: countryCodeSchema.describe("The country of the authority that publishes the source"),
  shortName: z.string().describe("A short name for the authority, for places where the full name does not fit"),
  authority: z.string().describe("The full name of the authority that publishes the data"),
  homepageUrl: z.string().describe("The authority's website"),
  license: z.string().describe("The license the data is published under, as the authority states it"),
  attribution: z.string().describe("The credit to show wherever the source's data is shown"),
  coverageNote: z.string().nullable().describe("What the source leaves out, to show next to the attribution"),
  isVisible: z.boolean().describe(SOURCE_VISIBLE_NOTE),
  isEnabled: z.boolean().optional().describe(`${SOURCE_ENABLED_NOTE}. ${ADMINISTRATORS_ONLY_NOTE}`),
  isRedistributable: z.boolean().optional().describe(`Whether the source's terms allow its data to be published. ${ADMINISTRATORS_ONLY_NOTE}`),
  datasets: z.array(officialDatasetSchema),
});
export type OfficialSource = z.infer<typeof officialSourceSchema>;

export const officialSourceListQuerySchema = z
  .object({
    countryCodes: csvCountryCodesSchema.optional().describe("Returns only the sources of these countries. Comma-separated two-letter country codes"),
  })
  .strict();
export type OfficialSourceListQuery = z.infer<typeof officialSourceListQuerySchema>;

export const officialSourceParamsSchema = z.object({ key: sourceKeySchema });

export const officialSourceUpdateSchema = z
  .object({
    isEnabled: z.boolean().optional().describe(SOURCE_ENABLED_NOTE),
    isVisible: z.boolean().optional().describe(SOURCE_VISIBLE_NOTE),
  })
  .strict()
  .refine(hasAnyField, AT_LEAST_ONE_FIELD_ISSUE);
export type OfficialSourceUpdate = z.infer<typeof officialSourceUpdateSchema>;

export const officialDatasetParamsSchema = z.object({ id: idParamSchema });

export const officialDatasetUpdateSchema = z
  .object({
    isEnabled: z.boolean().optional().describe(DATASET_ENABLED_NOTE),
    checkEveryHours: z.number().int().min(1).max(LONGEST_CHECK_INTERVAL_HOURS).optional().describe(CHECK_EVERY_HOURS_NOTE),
    holdShrinkPercent: z.number().int().min(0).max(100).nullable().optional().describe(`${HOLD_SHRINK_PERCENT_NOTE}. \`null\` restores the default`),
  })
  .strict()
  .refine(hasAnyField, AT_LEAST_ONE_FIELD_ISSUE);
export type OfficialDatasetUpdate = z.infer<typeof officialDatasetUpdateSchema>;

export const importRunChangeCountSchema = z.object({
  kind: z.enum(IMPORT_CHANGE_KINDS).describe(CHANGE_KIND_NOTE),
  count: countSchema,
});
export type ImportRunChangeCount = z.infer<typeof importRunChangeCountSchema>;

export const importRunSkipCountSchema = z.object({
  reason: z.string().describe(SKIP_REASON_NOTE),
  count: countSchema,
});
export type ImportRunSkipCount = z.infer<typeof importRunSkipCountSchema>;

export const importRunDatasetSchema = z.object({
  datasetId: idSchema,
  datasetKey: z.string(),
  error: z.string().nullable().describe("Why the dataset failed in this run: its files could not be found, downloaded or read"),
});
export type ImportRunDataset = z.infer<typeof importRunDatasetSchema>;

export const importRunRemapSchema = z.object({
  licenseeId: idSchema,
  fromOperatorId: idSchema.nullable().describe("The operator the licensee had when the run was queued"),
  toOperatorId: idSchema.nullable().describe("The operator the licensee gets, or `null` to leave it without one"),
});
export type ImportRunRemap = z.infer<typeof importRunRemapSchema>;

export const importRunSchema = z.object({
  id: z.uuid(),
  sourceKey: z.string(),
  kind: z.enum(IMPORT_RUN_KINDS).describe(`${RUN_KIND_NOTE}. ${REMAP_KIND_NOTE}`),
  trigger: z
    .enum(IMPORT_RUN_TRIGGERS)
    .describe("What queued the run: `scheduled` for the schedule, `manual` for a request to this API, `cli` for the server's command line"),
  isDryRun: z.boolean().describe(`${DRY_RUN_NOTE}. What it would have changed is in \`dryRunReport\` from \`GET /official/import-runs/{id}\``),
  status: z
    .enum(IMPORT_RUN_STATUSES)
    .describe(
      "`queued`: waiting to start. `running`: in progress. `done`: it ran to the end, " +
        "which can still include failed datasets (`datasets`) and held slices (`hasHeldSlices`). " +
        "`failed`: it stopped with `error`. `cancelled`: an administrator stopped it",
    ),
  error: z.string().nullable(),
  attempt: z
    .number()
    .int()
    .nonnegative()
    .describe("How many times the run has been started. More than 1 means it was picked up again. A run that would need a sixth start fails instead"),
  requester: userRefSchema.nullable().describe("`null` for a scheduled run and for one queued from the command line"),
  remap: importRunRemapSchema.nullable().describe("What a `remap` run changes. `null` for every other kind"),
  datasets: z.array(importRunDatasetSchema).describe("The datasets the run reads. Empty for a `remap` and a `relink` run"),
  hasHeldSlices: z.boolean().describe("Whether the run held at least one slice instead of applying it. Always `false` for a dry run"),
  changes: z
    .array(importRunChangeCountSchema)
    .describe("What the run changed, counted by kind. Kinds without a change are left out, and the list is empty for a dry run"),
  createdAt: z.iso.datetime().describe("When the run was queued"),
  startedAt: z.iso.datetime().nullable().describe("When the run first started"),
  claimedAt: z.iso.datetime().nullable().describe("When the run was last picked up. It is later than `startedAt` after the run was picked up again"),
  heartbeatAt: z.iso
    .datetime()
    .nullable()
    .describe("When the run last reported that it is still working. A running run that stays silent for 10 minutes is picked up again"),
  finishedAt: z.iso.datetime().nullable().describe("When the run ended, whatever its status"),
});
export type ImportRun = z.infer<typeof importRunSchema>;

export const importRunSliceSchema = z.object({
  datasetId: idSchema,
  datasetKey: z.string(),
  sliceKey: z.string().describe(SLICE_KEY_NOTE),
  outcome: z.enum(IMPORT_SLICE_OUTCOMES).describe(SLICE_OUTCOME_NOTE),
  releaseSha256: z.string().describe(`The release the run read for the slice. ${RELEASE_SHA256_NOTE}`),
  releaseRecordCount: countSchema.describe(RELEASE_RECORD_COUNT_NOTE),
  storedRecordCount: countSchema.describe(STORED_RECORD_COUNT_NOTE),
  changes: z.array(importRunChangeCountSchema).describe("What applying the slice changed, counted by kind"),
  skips: z.array(importRunSkipCountSchema).describe("The records of the slice that were skipped, counted by reason"),
});
export type ImportRunSlice = z.infer<typeof importRunSliceSchema>;

export const importRunStepSchema = z.object({
  step: z.enum(IMPORT_RUN_STEPS),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable().describe("`null` while the step is running, and when it failed"),
  error: z.string().nullable(),
});
export type ImportRunStep = z.infer<typeof importRunStepSchema>;

export const importRunApprovalSchema = z.object({
  datasetId: idSchema,
  sliceKey: z.string().describe(SLICE_KEY_NOTE),
  releaseSha256: z.string().describe(`The release that was approved. ${RELEASE_SHA256_NOTE}`),
});
export type ImportRunApproval = z.infer<typeof importRunApprovalSchema>;

export const dryRunSliceSchema = importRunSliceSchema.omit({ datasetId: true, releaseSha256: true });
export type DryRunSlice = z.infer<typeof dryRunSliceSchema>;

export const dryRunRemapSchema = z.object({
  sitesRekeyed: countSchema.describe("Official sites that would go to the new operator as they are, keeping their id"),
  sitesMerged: countSchema.describe("Official sites that would be merged into the site the new operator already has at the same location"),
  sitesSplit: countSchema.describe("Official sites that would be split in two, because only some of their permits move"),
  permitsMoved: countSchema.describe("Permits that would move to the new operator"),
  permitsMerged: countSchema.describe("Permits that would be merged into an equal permit the receiving site already has"),
  permitsBlocked: countSchema.describe(
    "Permits that cannot move, because another dataset lists them under a licensee whose operator stays. Remap that licensee as well to move them",
  ),
  blockedPermitIds: z.array(idSchema).describe("The ids of the blocked permits, up to 100 of them"),
  listingsRemoved: countSchema.describe("Listings of permits under this licensee that would be removed. Only when the licensee loses its operator"),
  watchesRepointed: countSchema.describe("Watches that would follow a merged site to the site it goes into"),
  notificationsRepointed: countSchema.describe("Notifications that would follow a merged site to the site it goes into"),
  listsRepointed: countSchema.describe("Saved lists that would follow a merged site to the site it goes into"),
});
export type DryRunRemap = z.infer<typeof dryRunRemapSchema>;

export const dryRunReportSchema = z.object({
  slices: z.array(dryRunSliceSchema).describe("The slices the run read, each with what applying it would change"),
  failedDatasets: z
    .array(z.object({ datasetKey: z.string(), error: z.string() }))
    .describe("The datasets whose files could not be found, downloaded or read"),
  changesOutsideSlices: z
    .array(importRunChangeCountSchema)
    .describe(
      "What the run would change outside its slices, counted by kind: permits that no dataset lists any more, links between permits and stations, " +
        "and what a `remap` does",
    ),
  stationNamesWritten: countSchema.describe(
    "Some sources publish the operator's own name for a site. This is how many stations would get such a name or a new one",
  ),
  stationNamesSkipped: countSchema.describe("How many of those names would be left out because they are too long"),
  licenseeNamesCorrected: countSchema.describe("How many licensees would get a corrected short name"),
  remap: dryRunRemapSchema.nullable().describe("What a `remap` run would do to the licensee's sites and permits. `null` for every other kind"),
});
export type DryRunReport = z.infer<typeof dryRunReportSchema>;

export const importRunDetailSchema = importRunSchema.extend({
  slices: z.array(importRunSliceSchema).describe(`The slices the run has handled so far. Empty for a dry run. ${SLICE_NOTE}`),
  steps: z
    .array(importRunStepSchema)
    .describe("The steps the run takes after its slices, in order. A step that has not started yet is not listed, and a dry run lists none"),
  plannedSteps: z
    .array(z.enum(IMPORT_RUN_STEPS))
    .describe("Every step the run takes after its slices, in order, including those that have not started yet. Empty for a dry run"),
  approvals: z.array(importRunApprovalSchema).describe("The held slices the run was told to apply"),
  dryRunReport: dryRunReportSchema
    .nullable()
    .describe(
      "What a dry run would have changed. `null` for a run that is not a dry run, for a dry run that has not finished, " +
        "and once the report is deleted, seven days after the run",
    ),
});
export type ImportRunDetail = z.infer<typeof importRunDetailSchema>;

export const importRunParamsSchema = z.object({ id: z.uuid() });

export const importRunListQuerySchema = z
  .object({
    sourceKeys: csvSourceKeysSchema.optional(),
    kinds: csvEnumSchema(IMPORT_RUN_KINDS).optional(),
    statuses: csvEnumSchema(IMPORT_RUN_STATUSES).optional(),
    isDryRun: booleanQuerySchema.optional(),
    limit: limitSchema,
    cursor: cursorSchema.optional(),
  })
  .strict();
export type ImportRunListQuery = z.infer<typeof importRunListQuerySchema>;

export const importRunListSchema = z.object({
  data: z.array(importRunSchema),
  paging: pagingSchema,
});
export type ImportRunList = z.infer<typeof importRunListSchema>;

const importRunApprovalInputSchema = z
  .object({
    datasetId: idSchema,
    sliceKey: sliceKeySchema.describe(SLICE_KEY_NOTE),
    releaseSha256: releaseSha256Schema.describe(
      "The `releaseSha256` of the held slice you reviewed. The approval only counts for that release, so the slice is held again " +
        "if the run finds another one",
    ),
  })
  .strict();

export const importRunCreateSchema = z
  .object({
    sourceKey: sourceKeySchema,
    kind: z.enum(STARTABLE_IMPORT_RUN_KINDS).optional().describe(`${RUN_KIND_NOTE}. Defaults to \`import\``),
    isDryRun: z.boolean().optional().describe(`${DRY_RUN_NOTE}. Defaults to \`false\``),
    datasetIds: z
      .array(idSchema)
      .min(1)
      .max(RUN_DATASET_LIMIT)
      .refine((ids) => new Set(ids).size === ids.length, { message: "Dataset ids must be unique" })
      .optional()
      .describe("The datasets to read. Defaults to every enabled dataset of the source. Not accepted for a `relink` run"),
    approvals: z
      .array(importRunApprovalInputSchema)
      .min(1)
      .max(RUN_APPROVAL_LIMIT)
      .refine((approvals) => new Set(approvals.map(({ datasetId, sliceKey }) => `${datasetId}:${sliceKey}`)).size === approvals.length, {
        message: "A slice can be approved only once",
      })
      .optional()
      .describe("Held slices to apply anyway, each with the release you reviewed. Not accepted for a `relink` run"),
  })
  .strict()
  .refine((run) => run.kind !== "relink" || run.datasetIds === undefined, { path: ["datasetIds"], message: "A relink run reads no dataset" })
  .refine((run) => run.kind !== "relink" || run.approvals === undefined, { path: ["approvals"], message: "A relink run reads no dataset" });
export type ImportRunCreate = z.infer<typeof importRunCreateSchema>;

export const licenseeSchema = z.object({
  id: idSchema,
  sourceKey: z.string(),
  name: z.string().describe("A short form of the name, without the company's legal form"),
  legalName: z.string().describe("The licensee's name as the source publishes it"),
  operatorId: idSchema
    .nullable()
    .describe(`${LICENSEE_OPERATOR_NOTE}. While it is \`null\`, the official sites and permits published under this name are not imported`),
  brandId: idSchema.nullable().describe(LICENSEE_BRAND_NOTE),
});
export type Licensee = z.infer<typeof licenseeSchema>;

export const licenseeParamsSchema = z.object({ id: idParamSchema });

export const licenseeListQuerySchema = z
  .object({
    ids: csvIdsSchema.optional().describe("Returns only the licensees with these ids. Comma-separated ids"),
    sourceKeys: csvSourceKeysSchema.optional(),
    hasOperator: booleanQuerySchema.optional(),
    hasMicrowaveLinks: booleanQuerySchema.optional(),
    limit: z.coerce.number<number>().int().min(1).max(MAX_LICENSEE_LIST_LIMIT).default(50),
    cursor: cursorSchema.optional(),
  })
  .strict();
export type LicenseeListQuery = z.infer<typeof licenseeListQuerySchema>;

export const licenseeListSchema = z.object({
  data: z.array(licenseeSchema),
  paging: pagingSchema,
});
export type LicenseeList = z.infer<typeof licenseeListSchema>;

export const licenseeUpdateSchema = z
  .object({
    operatorId: idSchema
      .nullable()
      .optional()
      .describe(
        `${LICENSEE_OPERATOR_NOTE}. It is set at once for a licensee without an operator. ` +
          "For a licensee that has one, another operator or `null` queues a `remap` run instead of changing the licensee",
      ),
    brandId: idSchema.nullable().optional().describe(LICENSEE_BRAND_NOTE),
    isDryRun: z
      .boolean()
      .optional()
      .describe(
        "Only read when the request changes or removes the operator of a licensee that has one. " +
          "`true`, the default, queues the `remap` run as a dry run. `false` queues the run that makes the change",
      ),
  })
  .strict()
  .refine((licensee) => licensee.operatorId !== undefined || licensee.brandId !== undefined, { message: "Send operatorId, brandId or both" })
  .refine((licensee) => (licensee.operatorId ?? null) === null || (licensee.brandId ?? null) === null, {
    path: ["brandId"],
    message: "A licensee with an operator has no brand of its own",
  });
export type LicenseeUpdate = z.infer<typeof licenseeUpdateSchema>;

export const licenseeUpdateAnswerSchema = z.object({
  data: licenseeSchema,
  importRun: importRunSchema.nullable().describe("The import run the request queued: a `replay` or a `remap`"),
});
export type LicenseeUpdateAnswer = z.infer<typeof licenseeUpdateAnswerSchema>;
