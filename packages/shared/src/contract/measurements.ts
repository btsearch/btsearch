import { z } from "zod/v4";

import {
  AT_LEAST_ONE_FIELD_ISSUE,
  booleanQuerySchema,
  csvEnumSchema,
  csvUuidsSchema,
  cursorSchema,
  hasAnyField,
  instantSchema,
  limitSchema,
  pagingSchema,
  userRefSchema,
} from "./common.ts";

export const MEASUREMENT_FORMAT_VERSION = 1;
export const MEASUREMENT_SIGNATURE_CONTEXT = "btsearch-measurements-v1";
export const MEASUREMENT_CONTENT_TYPES = ["application/zstd", "application/gzip"] as const;
export type MeasurementContentType = (typeof MEASUREMENT_CONTENT_TYPES)[number];

export const MEASUREMENT_UPLOAD_LIMITS = {
  bodyBytes: 4 * 1024 * 1024,
  documentBytes: 64 * 1024 * 1024,
  snapshots: 20_000,
  fixes: 40_000,
  cells: 5_000,
  spanHours: 24,
  sampleAgeDays: 90,
} as const;

export const MEASUREMENT_UPLOAD_QUOTAS = {
  windowHours: 24,
  uploadsPerPerson: 300,
  bytesPerPerson: 100 * 1024 * 1024,
  bytesPerNewPerson: 50 * 1024 * 1024,
  newPersonDays: 7,
  uploadsPerDevice: 200,
} as const;

export const MEASUREMENT_DEVICE_LIMITS = { activeDevices: 5, registrationsPerDay: 3 } as const;

export const MEASUREMENT_SESSION_MODES = ["passive", "active", "survey"] as const;
export type MeasurementSessionMode = (typeof MEASUREMENT_SESSION_MODES)[number];

export const MEASUREMENT_READER_SOURCES = ["api", "modemLog", "modemPoll"] as const;
export type MeasurementReaderSource = (typeof MEASUREMENT_READER_SOURCES)[number];

export const MEASUREMENT_ROLES = ["serving", "aggregated", "nrSecondary", "neighbour"] as const;
export type MeasurementRole = (typeof MEASUREMENT_ROLES)[number];

export const MEASUREMENT_NETWORK_TYPES = [
  "gprs",
  "edge",
  "umts",
  "cdma",
  "evdo0",
  "evdoA",
  "cdma1xRtt",
  "hsdpa",
  "hsupa",
  "hspa",
  "iden",
  "evdoB",
  "lte",
  "ehrpd",
  "hspap",
  "gsm",
  "tdScdma",
  "iwlan",
  "lteCa",
  "nr",
] as const;
export const MEASUREMENT_DISPLAY_OVERRIDES = ["none", "lteCa", "lteAdvancedPro", "nrNsa", "nrAdvanced"] as const;
export const MEASUREMENT_DATA_ACTIVITIES = ["none", "in", "out", "inOut", "dormant"] as const;
export const MEASUREMENT_CONNECTION_STATUSES = ["none", "primaryServing", "secondaryServing"] as const;

export const ACCESS_BARRING_SERVICES = [
  "csService",
  "psService",
  "csVoice",
  "moSignalling",
  "moData",
  "csFallback",
  "mmtelVoice",
  "mmtelVideo",
  "emergency",
  "sms",
] as const;
export const ACCESS_BARRING_KINDS = ["unconditional", "conditional"] as const;

export const MEASUREMENT_UPLOAD_STATUSES = ["received", "processing", "processed", "rejected", "withdrawn", "excluded"] as const;
export type MeasurementUploadStatus = (typeof MEASUREMENT_UPLOAD_STATUSES)[number];

export const MEASUREMENT_DEVICE_TIERS = ["strong", "hardware", "software", "none"] as const;
export type MeasurementDeviceTier = (typeof MEASUREMENT_DEVICE_TIERS)[number];

export const ATTESTATION_SECURITY_LEVELS = ["strongBox", "trustedEnvironment", "software"] as const;
export const VERIFIED_BOOT_STATES = ["verified", "selfSigned", "unverified", "failed"] as const;

export const MEASUREMENT_OWNERS = ["mine", "all"] as const;
export const MEASUREMENT_DEVICE_INCLUDES = ["owner"] as const;
export const MEASUREMENT_DEVICE_SORTS = ["-createdAt", "createdAt"] as const;
export const MEASUREMENT_UPLOAD_SORTS = ["-receivedAt", "receivedAt", "-updatedAt", "updatedAt"] as const;

const plmnSchema = z.string().regex(/^\d{5,6}$/, "Must be the network code as 5 or 6 digits, for example 26006");
const integerSchema = z.number().int();
const positionSchema = z.number().int().nonnegative();
const simSlotSchema = z.number().int().nonnegative();
const elapsedMillisSchema = z.number().int().nonnegative().describe("Milliseconds of `SystemClock.elapsedRealtime()`");
const kilohertzSchema = z.number().int().positive();
const nameSchema = z.string().trim().min(1).max(64);
const bandsSchema = z.array(z.number().int().positive()).max(16);
const appSchema = z.object({ versionCode: z.number().int().positive(), versionName: nameSchema });

const fieldListSchema = z.array(z.string().min(1).max(64)).max(64);
const provenanceShape = {
  derived: fieldListSchema.optional().describe("The fields the reader computed or guessed instead of reading them. They count as hints only"),
  corrected: z
    .record(z.string().min(1).max(64), z.string().min(1).max(64))
    .optional()
    .describe("The fields the reader changed with a known-quirk rule, each with the rule's id"),
};

const cellShape = {
  plmn: plmnSchema.optional().describe("The cell's network. For a shared cell, its primary network"),
  additionalPlmns: z
    .array(plmnSchema)
    .max(12)
    .optional()
    .describe("The other networks a shared cell broadcasts. An empty list means the phone read it and there were none; leave it out when unknown"),
  bands: bandsSchema.optional(),
  barred: z.boolean().optional().describe("From the modem's system information"),
  reservedForOperatorUse: z.array(plmnSchema).max(12).optional().describe("The networks for which the cell is reserved. An empty list means none"),
  ...provenanceShape,
};

const lteTddSchema = z.object({ subframeAssignment: integerSchema, specialSubframePatterns: integerSchema });
const nrTddPatternShape = {
  periodMicros: integerSchema,
  downlinkSlots: integerSchema,
  downlinkSymbols: integerSchema,
  uplinkSlots: integerSchema,
  uplinkSymbols: integerSchema,
};
const nrTddSchema = z.object({ referenceScsKhz: integerSchema, ...nrTddPatternShape, pattern2: z.object(nrTddPatternShape).optional() });

const gsmCellSchema = z.object({
  rat: z.literal("gsm"),
  lac: integerSchema.optional(),
  cid: integerSchema.optional(),
  arfcn: integerSchema.optional(),
  bsic: integerSchema.optional(),
  ...cellShape,
});

const umtsCellSchema = z.object({
  rat: z.literal("umts"),
  lac: integerSchema.optional(),
  longCid: integerSchema.optional().describe("The 28-bit cell id Android reports, the RNC included"),
  uarfcn: integerSchema.optional(),
  psc: integerSchema.optional(),
  ...cellShape,
});

const lteCellSchema = z.object({
  rat: z.literal("lte"),
  eci: integerSchema.optional().describe("The 28-bit cell identity"),
  tac: integerSchema.optional(),
  earfcn: integerSchema.optional(),
  pci: integerSchema.optional(),
  bandwidthKhz: kilohertzSchema.optional().describe("The downlink bandwidth of this cell. Send it only when the reader ties it to this cell"),
  ulEarfcn: integerSchema.optional(),
  ulBandwidthKhz: kilohertzSchema.optional(),
  endcAvailable: z.boolean().optional().describe("Whether the cell offers 5G NSA"),
  tdd: lteTddSchema.optional(),
  ...cellShape,
});

const nrCellSchema = z.object({
  rat: z.literal("nr"),
  nci: integerSchema.optional().describe("The 36-bit cell identity"),
  tac: integerSchema.optional(),
  arfcn: integerSchema.optional(),
  pci: integerSchema.optional(),
  bandwidthKhz: kilohertzSchema.optional().describe("The downlink bandwidth of this cell. Send it only when the reader ties it to this cell"),
  ulArfcn: integerSchema.optional(),
  ulBandwidthKhz: kilohertzSchema.optional(),
  tdd: nrTddSchema.optional(),
  ...cellShape,
});

export const measurementCellSchema = z
  .discriminatedUnion("rat", [gsmCellSchema, umtsCellSchema, lteCellSchema, nrCellSchema])
  .describe("One cell of the upload, each identity once. A cell known only by its channel and code is allowed");
export type MeasurementCell = z.infer<typeof measurementCellSchema>;

export const measurementFixSchema = z.object({
  t: elapsedMillisSchema,
  gnssTimeMillis: integerSchema.describe("`Location.getTime()`, the satellite time in milliseconds since the epoch"),
  latitude: z.number().describe("At most 7 decimals"),
  longitude: z.number().describe("At most 7 decimals"),
  accuracyMeters: z.number().nonnegative(),
  altitudeMeters: z.number().optional(),
  verticalAccuracyMeters: z.number().nonnegative().optional(),
  speedMetersPerSecond: z.number().optional(),
  speedAccuracyMetersPerSecond: z.number().nonnegative().optional(),
  bearingDegrees: z.number().optional(),
  bearingAccuracyDegrees: z.number().nonnegative().optional(),
  provider: z.literal("gps"),
  isMock: z.boolean(),
});
export type MeasurementFix = z.infer<typeof measurementFixSchema>;

export const measurementSchema = z
  .object({
    cell: positionSchema.describe("A position in `cells`, counted from 0"),
    role: z.enum(MEASUREMENT_ROLES),
    t: elapsedMillisSchema.optional().describe("The cell's own time, when it differs from the snapshot's"),
    connectionStatus: z.enum(MEASUREMENT_CONNECTION_STATUSES).optional(),
    accessBarring: z
      .partialRecord(z.enum(ACCESS_BARRING_SERVICES), z.enum(ACCESS_BARRING_KINDS))
      .optional()
      .describe("Serving cell only: the services the cell bars. An empty object means nothing is barred; leave it out when it was not read"),
    rsrpDbm: integerSchema.optional(),
    rsrqDb: integerSchema.optional(),
    rssnrDb: integerSchema.optional(),
    rssiDbm: integerSchema.optional(),
    cqi: integerSchema.optional(),
    ssRsrpDbm: integerSchema.optional(),
    ssRsrqDb: integerSchema.optional(),
    ssSinrDb: integerSchema.optional(),
    csiRsrpDbm: integerSchema.optional(),
    csiRsrqDb: integerSchema.optional(),
    csiSinrDb: integerSchema.optional(),
    subcarrierSpacingKhz: integerSchema.optional(),
    ssbIndex: integerSchema.optional(),
    rscpDbm: integerSchema.optional(),
    ecNoDb: integerSchema.optional(),
    bitErrorRate: integerSchema.optional(),
    timingAdvance: integerSchema.optional().describe("In the steps of the cell's technology: LTE 0 to 1282, GSM 0 to 219, NR as the reader gives it"),
    ...provenanceShape,
  })
  .describe("One cell of a snapshot. Send the signal fields of the cell's technology");
export type Measurement = z.infer<typeof measurementSchema>;

export const measurementSnapshotSchema = z.object({
  t: elapsedMillisSchema,
  simSlot: simSlotSchema,
  registeredPlmn: plmnSchema.optional().describe("The network the SIM is registered on, when it differs from `sims`"),
  isRoaming: z.boolean().optional().describe("Android's roaming flag, when it differs from `sims`"),
  nrAvailable: z.boolean().optional(),
  dcNrRestricted: z.boolean().optional(),
  reader: positionSchema.describe("A position in `readers`, counted from 0"),
  dataNetworkType: z
    .enum(MEASUREMENT_NETWORK_TYPES)
    .optional()
    .describe("Android's `NETWORK_TYPE_` constant, in camelCase. Leave it out when unknown"),
  displayOverride: z.enum(MEASUREMENT_DISPLAY_OVERRIDES).optional(),
  dataActivity: z.enum(MEASUREMENT_DATA_ACTIVITIES).optional(),
  measurements: z.array(measurementSchema).max(64),
});
export type MeasurementSnapshot = z.infer<typeof measurementSnapshotSchema>;

export const measurementEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("sessionStart"), t: elapsedMillisSchema, session: positionSchema.describe("A position in `sessions`, counted from 0") }),
  z.object({ type: z.literal("sessionEnd"), t: elapsedMillisSchema, session: positionSchema.describe("A position in `sessions`, counted from 0") }),
  z.object({ type: z.literal("airplaneMode"), t: elapsedMillisSchema, isOn: z.boolean() }),
  z.object({ type: z.literal("simChanged"), t: elapsedMillisSchema, simSlot: simSlotSchema }),
  z.object({ type: z.literal("locationOff"), t: elapsedMillisSchema, untilT: elapsedMillisSchema.optional() }),
  z
    .object({ type: z.literal("exclusionGap"), t: elapsedMillisSchema, untilT: elapsedMillisSchema })
    .describe("The app removed the points inside one of the person's exclusion zones. No coordinates are sent"),
  z
    .object({
      type: z.literal("readerDiff"),
      t: elapsedMillisSchema,
      reader: positionSchema.describe("A position in `readers`, counted from 0"),
      fields: z.record(z.string().min(1).max(64), z.number().int().nonnegative()),
    })
    .describe("How often a reader running in shadow disagreed with the active one, counted per field"),
  z.object({ type: z.literal("bandLock"), t: elapsedMillisSchema, bands: bandsSchema }).describe("Survey only"),
]);
export type MeasurementEvent = z.infer<typeof measurementEventSchema>;

export const measurementReaderSchema = z.object({
  name: z.string().trim().min(1).max(32).describe("For example `btsearch`, `netmonsterCore`, `qualcommDiag` or `qualcommQmi`"),
  version: nameSchema,
  source: z.enum(MEASUREMENT_READER_SOURCES),
  shell: z.boolean().optional().describe("True when the reader read values through Shizuku"),
  rules: z.number().int().nonnegative().optional().describe("The version of the quirk rules the reader applied"),
});
export type MeasurementReader = z.infer<typeof measurementReaderSchema>;

function spanMillis(batch: { fixes: MeasurementFix[]; snapshots: MeasurementSnapshot[] }): number {
  let earliest = Number.POSITIVE_INFINITY;
  let latest = Number.NEGATIVE_INFINITY;
  for (const { t } of [...batch.fixes, ...batch.snapshots]) {
    earliest = Math.min(earliest, t);
    latest = Math.max(latest, t);
  }
  return latest > earliest ? latest - earliest : 0;
}

export const measurementBatchSchema = z
  .object({
    formatVersion: z.literal(MEASUREMENT_FORMAT_VERSION),
    uploadId: z.uuidv7().describe("Must be the id in the path"),
    deviceId: z.uuid().describe("Must be the `X-Device-Id` header"),
    app: appSchema,
    os: z.object({
      sdkInt: z.number().int().positive(),
      securityPatch: z.iso.date().optional(),
      radioVersion: z.string().trim().min(1).max(128).optional().describe("The modem firmware, `Build.getRadioVersion()`"),
    }),
    clock: z
      .object({ elapsedRealtimeMillis: elapsedMillisSchema, epochMillis: z.number().int().nonnegative() })
      .describe("The monotonic clock and the wall clock read at the same moment"),
    sessions: z.array(z.object({ id: z.uuid(), mode: z.enum(MEASUREMENT_SESSION_MODES) })).max(64),
    startsMidTrip: z
      .boolean()
      .optional()
      .describe(
        "`true` when the upload starts during a trip that began at least 300 m earlier along the track. A trip ends at a stop or a five-minute gap. Left out, public trails skip the upload's first 300 m",
      ),
    endsMidTrip: z
      .boolean()
      .optional()
      .describe(
        "`true` when the trip went on for at least 300 m along the track after the upload ended, so send it once you know. Left out, public trails skip its last 300 m",
      ),
    sims: z
      .array(
        z.object({
          slot: simSlotSchema,
          simPlmn: plmnSchema.optional().describe("The SIM's own network"),
          registeredPlmn: plmnSchema.optional().describe("The network the SIM is registered on"),
          isRoaming: z.boolean().optional(),
          isDataSim: z.boolean(),
        }),
      )
      .max(8)
      .describe("Each SIM when the upload began"),
    readers: z.array(measurementReaderSchema).min(1).max(16),
    cells: z.array(measurementCellSchema).max(MEASUREMENT_UPLOAD_LIMITS.cells),
    fixes: z.array(measurementFixSchema).max(MEASUREMENT_UPLOAD_LIMITS.fixes),
    snapshots: z.array(measurementSnapshotSchema).max(MEASUREMENT_UPLOAD_LIMITS.snapshots),
    events: z.array(measurementEventSchema).max(10_000).optional(),
  })
  .superRefine((batch, ctx) => {
    const snapshotWithMissingCell = batch.snapshots.findIndex((snapshot) => snapshot.measurements.some(({ cell }) => cell >= batch.cells.length));
    if (snapshotWithMissingCell !== -1) {
      ctx.addIssue({ code: "custom", path: ["snapshots", snapshotWithMissingCell], message: "Points at a cell that is not in `cells`" });
    }
    const snapshotWithMissingReader = batch.snapshots.findIndex((snapshot) => snapshot.reader >= batch.readers.length);
    if (snapshotWithMissingReader !== -1) {
      ctx.addIssue({ code: "custom", path: ["snapshots", snapshotWithMissingReader], message: "Points at a reader that is not in `readers`" });
    }
    if (spanMillis(batch) > MEASUREMENT_UPLOAD_LIMITS.spanHours * 60 * 60 * 1000) {
      ctx.addIssue({ code: "custom", path: ["snapshots"], message: `Must span at most ${MEASUREMENT_UPLOAD_LIMITS.spanHours} hours` });
    }
  })
  .describe(
    "The JSON document inside the compressed body of `PUT /measurements/uploads/:id`, format version 1. " +
      "Fields the server does not know are ignored, so a later app can add optional fields without a new version. " +
      "Values out of range are dropped one by one when the upload is processed; they do not reject the upload",
  );
export type MeasurementBatch = z.infer<typeof measurementBatchSchema>;

export const measurementConfigSchema = z.object({
  uploadsEnabled: z
    .boolean()
    .describe("While `false`, device challenges, new devices, new uploads and accepting the terms are refused with 403 `FEATURE_DISABLED`"),
  minAppVersionCode: z
    .number()
    .int()
    .positive()
    .describe("Registering a device or uploading from a lower `versionCode` is refused with 403 `APP_UPDATE_REQUIRED`"),
  termsVersion: z.number().int().positive().describe("The version of the contributor terms to accept with `PUT /measurements/terms`"),
  limits: z.object({
    upload: z.object({
      bodyBytes: z.number().int().describe("The largest compressed body"),
      documentBytes: z.number().int().describe("The largest document once decompressed"),
      snapshots: z.number().int(),
      fixes: z.number().int(),
      cells: z.number().int(),
      spanHours: z.number().int().describe("The longest time from the first to the last reading of one upload"),
      sampleAgeDays: z.number().int().describe("Readings older than this when the upload arrives are dropped"),
    }),
    quotas: z
      .object({
        windowHours: z.number().int(),
        uploadsPerPerson: z.number().int(),
        bytesPerPerson: z.number().int().describe("Compressed bytes"),
        bytesPerNewPerson: z.number().int().describe("Compressed bytes, in the first `newPersonDays` after you first accept the terms"),
        newPersonDays: z.number().int(),
        uploadsPerDevice: z.number().int(),
      })
      .describe("What one person, or one device, can upload in any `windowHours` hours"),
    devices: z.object({ activeDevices: z.number().int().describe("Revoked devices do not count"), registrationsPerDay: z.number().int() }),
  }),
});
export type MeasurementConfig = z.infer<typeof measurementConfigSchema>;

export const measurementTermsSchema = z.object({
  currentVersion: z.number().int().positive(),
  acceptedVersion: z.number().int().positive().nullable().describe("The latest version you accepted"),
  acceptedAt: z.iso.datetime().nullable(),
});
export type MeasurementTerms = z.infer<typeof measurementTermsSchema>;

export const measurementTermsAcceptSchema = z
  .object({ version: z.number().int().positive().describe("`currentVersion` from `GET /measurements/terms`") })
  .strict();
export type MeasurementTermsAccept = z.infer<typeof measurementTermsAcceptSchema>;

const quotaSchema = z.object({ limit: z.number().int(), remaining: z.number().int() });

export const measurementUploadsLimitSchema = z
  .object({
    uploads: quotaSchema,
    bytes: quotaSchema.describe("Compressed bytes"),
    resetsAt: z.iso.datetime().nullable().describe(`When the oldest upload that counts turns ${MEASUREMENT_UPLOAD_QUOTAS.windowHours} hours old`),
  })
  .describe(`Every upload received in the last ${MEASUREMENT_UPLOAD_QUOTAS.windowHours} hours counts, whatever its status, a withdrawn one too`);
export type MeasurementUploadsLimit = z.infer<typeof measurementUploadsLimitSchema>;

export const deviceChallengeSchema = z.object({
  challenge: z.string().describe("32 bytes in base64url. The new key's attestation challenge is the decoded bytes, not the text"),
  expiresAt: z.iso.datetime(),
});
export type DeviceChallenge = z.infer<typeof deviceChallengeSchema>;

export const measurementDeviceCreateSchema = z
  .object({
    challenge: z.base64url().length(43).describe("From `POST /measurements/device-challenges`"),
    challengeSignature: z.base64url().max(200).describe("The challenge's 32 bytes signed with the new key, ECDSA with SHA-256, in DER"),
    publicKey: z.base64url().max(1024).describe("The new key's SubjectPublicKeyInfo in DER. Must be an EC P-256 signing key"),
    certificateChain: z
      .array(z.base64url().max(16_384))
      .max(10)
      .describe("The key's attestation chain in DER, leaf first. An empty chain registers the device with tier `none`"),
    label: nameSchema.nullable().optional(),
    phoneId: z.base64url().length(43).describe("The SHA-256 of `Settings.Secure.ANDROID_ID`. It is never returned"),
    hardware: z
      .object({
        manufacturer: nameSchema,
        model: nameSchema,
        board: nameSchema.optional().describe("`Build.BOARD`"),
        socManufacturer: nameSchema.optional(),
        socModel: nameSchema.optional(),
        sdkInt: z.number().int().positive(),
        securityPatch: z.iso.date().optional(),
      })
      .strict(),
    app: appSchema.strict(),
  })
  .strict()
  .describe("Binary values are base64url without padding");
export type MeasurementDeviceCreate = z.infer<typeof measurementDeviceCreateSchema>;

export const measurementDeviceSchema = z.object({
  id: z.uuid(),
  label: z.string().nullable(),
  hardware: z.object({ manufacturer: z.string(), model: z.string(), socModel: z.string().nullable() }),
  attestation: z
    .object({
      tier: z
        .enum(MEASUREMENT_DEVICE_TIERS)
        .describe("Can drop later, for example when one of the key's certificates is revoked. The other fields are read once, at registration"),
      securityLevel: z.enum(ATTESTATION_SECURITY_LEVELS).nullable(),
      verifiedBootState: z.enum(VERIFIED_BOOT_STATES).nullable(),
      isBootloaderLocked: z.boolean().nullable(),
    })
    .describe("What the key's attestation says about the phone. `null` fields were not in it"),
  isRevoked: z.boolean(),
  revokedAt: z.iso.datetime().nullable(),
  revocationReason: z.string().nullable().describe("Written by an administrator who revoked the device"),
  createdAt: z.iso.datetime(),
  lastUploadAt: z.iso.datetime().nullable(),
  owner: userRefSchema.nullable().optional().describe("Administrators only, with `include=owner`. `null` once the account is deleted"),
});
export type MeasurementDevice = z.infer<typeof measurementDeviceSchema>;

export const measurementDeviceListQuerySchema = z
  .object({
    owners: z.enum(MEASUREMENT_OWNERS).default("mine").describe("`all` is for administrators"),
    sort: z.enum(MEASUREMENT_DEVICE_SORTS).default("-createdAt"),
    include: csvEnumSchema(MEASUREMENT_DEVICE_INCLUDES).optional(),
    limit: limitSchema,
    cursor: cursorSchema.optional(),
    includeTotal: booleanQuerySchema.optional(),
  })
  .strict();

export type MeasurementDeviceListQuery = z.infer<typeof measurementDeviceListQuerySchema>;

export const measurementDeviceListSchema = z.object({ data: z.array(measurementDeviceSchema), paging: pagingSchema });
export type MeasurementDeviceList = z.infer<typeof measurementDeviceListSchema>;

export const measurementDeviceUpdateSchema = z
  .object({
    label: nameSchema.nullable().optional().describe("Only the device's owner can change it"),
    isRevoked: z.boolean().optional().describe("You can revoke your own device. Only an administrator can restore one"),
    reason: z.string().trim().min(1).max(500).optional().describe("Administrators only, with `isRevoked: true`. The device's owner sees it"),
  })
  .strict()
  .refine(hasAnyField, AT_LEAST_ONE_FIELD_ISSUE)
  .refine((change) => change.reason === undefined || change.isRevoked === true, { path: ["reason"], error: "Send it with `isRevoked: true`" });
export type MeasurementDeviceUpdate = z.infer<typeof measurementDeviceUpdateSchema>;

export const measurementUploadParamsSchema = z.object({
  id: z.uuidv7().describe("The app makes it when it closes the batch. Its time must lie between 120 days ago and one day ahead"),
});

export const measurementUploadHeadersSchema = z.object({
  "x-device-id": z.uuid().describe("The registered device that signed the upload"),
  "x-device-signature": z.base64url().max(200).describe("The device key's ECDSA signature with SHA-256 over the signed lines, in DER"),
  "x-app-version-code": z.coerce.number().int().positive(),
});
export type MeasurementUploadHeaders = z.infer<typeof measurementUploadHeadersSchema>;

export const measurementUploadSchema = z.object({
  id: z.uuid(),
  deviceId: z.uuid(),
  status: z
    .enum(MEASUREMENT_UPLOAD_STATUSES)
    .describe("Uploads are not processed yet, so for now an upload stays `received` until it is withdrawn or excluded"),
  statusReason: z.string().nullable().describe("Why the upload was rejected or excluded"),
  contentType: z.enum(MEASUREMENT_CONTENT_TYPES),
  sizeBytes: z.number().int().describe("The size of the compressed body"),
  receivedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime().describe("When the status last changed"),
  result: z
    .object({
      processedAt: z.iso.datetime(),
      startedAt: z.iso.datetime().describe("The time of the first reading"),
      endedAt: z.iso.datetime().describe("The time of the last reading"),
      bbox: z.object({ west: z.number(), south: z.number(), east: z.number(), north: z.number() }),
      samples: z.object({
        total: z.number().int(),
        kept: z.number().int(),
        dropped: z.record(z.string(), z.number().int()).describe("Counts by reason"),
      }),
      discoveries: z.object({ cells: z.number().int(), sites: z.number().int() }).describe("The cells and sites this upload found first"),
    })
    .nullable()
    .describe("`null` until the upload is processed"),
  fileExpiresAt: z.iso.datetime().nullable().describe("When the raw file is deleted at the latest. `null` once it is gone"),
});
export type MeasurementUpload = z.infer<typeof measurementUploadSchema>;

export const measurementUploadListQuerySchema = z
  .object({
    uploaders: z.enum(MEASUREMENT_OWNERS).default("mine").describe("`all` is for administrators"),
    deviceIds: csvUuidsSchema.optional(),
    statuses: csvEnumSchema(MEASUREMENT_UPLOAD_STATUSES).optional(),
    receivedAfter: instantSchema.optional().describe("Only uploads received at or after this time"),
    updatedAfter: instantSchema.optional().describe("Only uploads whose status changed at or after this time"),
    sort: z.enum(MEASUREMENT_UPLOAD_SORTS).default("-receivedAt"),
    limit: limitSchema,
    cursor: cursorSchema.optional(),
    includeTotal: booleanQuerySchema.optional(),
  })
  .strict();

export type MeasurementUploadListQuery = z.infer<typeof measurementUploadListQuerySchema>;

export const measurementUploadListSchema = z.object({ data: z.array(measurementUploadSchema), paging: pagingSchema });
export type MeasurementUploadList = z.infer<typeof measurementUploadListSchema>;

const exclusionReasonSchema = z.string().trim().min(1).max(500).describe("The person who sent the upload sees it");

export const measurementUploadUpdateSchema = z.discriminatedUnion("status", [
  z
    .object({ status: z.literal("withdrawn") })
    .strict()
    .describe("Only for your own uploads. The file is deleted within the hour"),
  z
    .object({ status: z.literal("excluded"), reason: exclusionReasonSchema })
    .strict()
    .describe("Administrators only. The file is kept until it expires, as evidence"),
]);
export type MeasurementUploadUpdate = z.infer<typeof measurementUploadUpdateSchema>;

export const MEASUREMENT_UPLOAD_IDS_LIMIT = 100;

const uploadIdsSchema = z.array(z.uuid()).min(1).max(MEASUREMENT_UPLOAD_IDS_LIMIT);

export const measurementWithdrawalSchema = z
  .union([z.object({ uploadIds: uploadIdsSchema }).strict(), z.object({ all: z.literal(true) }).strict()])
  .describe("Either the uploads to withdraw, or `all` for every upload of yours");
export type MeasurementWithdrawal = z.infer<typeof measurementWithdrawalSchema>;

export const measurementWithdrawalResultSchema = z.object({
  data: z.object({ withdrawnCount: z.number().int().nonnegative().describe("Uploads that were withdrawn already are not counted") }),
});
export type MeasurementWithdrawalResult = z.infer<typeof measurementWithdrawalResultSchema>;

export const measurementExclusionSchema = z
  .union([
    z.object({ uploadIds: uploadIdsSchema, reason: exclusionReasonSchema }).strict(),
    z.object({ userId: z.uuid(), reason: exclusionReasonSchema }).strict(),
  ])
  .describe("Either the uploads to exclude, or `userId` for every upload that person has sent so far");
export type MeasurementExclusion = z.infer<typeof measurementExclusionSchema>;

export const measurementExclusionResultSchema = z.object({
  data: z.object({ excludedCount: z.number().int().nonnegative().describe("Uploads that were withdrawn or excluded already are not counted") }),
});
export type MeasurementExclusionResult = z.infer<typeof measurementExclusionResultSchema>;
