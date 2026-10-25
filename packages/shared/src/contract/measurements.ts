import { z } from "zod/v4";

import {
  AT_LEAST_ONE_FIELD_ISSUE,
  booleanQuerySchema,
  csvEnumSchema,
  csvIdsSchema,
  csvUuidsSchema,
  cursorSchema,
  hasAnyField,
  idParamSchema,
  instantSchema,
  limitSchema,
  pagingSchema,
  userRefSchema,
} from "./common.ts";
import {
  ATTESTATION_SECURITY_LEVELS,
  CELL_RATS,
  MEASUREMENT_DROP_REASONS,
  MEASUREMENT_MODEM_FAMILIES,
  MEASUREMENT_READER_SOURCES,
  MEASUREMENT_UPLOAD_STATUSES,
  READING_BLOCK_FIELDS,
  READING_BLOCK_MODES,
  READING_BLOCK_ROLES,
  TIMING_ADVANCE_RATS,
  VERIFIED_BOOT_STATES,
} from "./constants.ts";

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

export const MEASUREMENT_REJECTION_REASONS = [
  "fileMissing",
  "sealFailed",
  "bodyMismatch",
  "invalidDocument",
  "formatVersion",
  "idMismatch",
  "limitExceeded",
  "noSamples",
  "processingFailed",
] as const;
export type MeasurementRejectionReason = (typeof MEASUREMENT_REJECTION_REASONS)[number];

export const MEASUREMENT_DEVICE_TIERS = ["strong", "hardware", "software", "none"] as const;
export type MeasurementDeviceTier = (typeof MEASUREMENT_DEVICE_TIERS)[number];
export const MEASUREMENT_WEIGHT_BASES = ["device", "vouch", "computed"] as const;

export const READING_BLOCK_HELD_FIELDS = ["pci", "channel", "areaCode", "bandwidth"] as const;

export const MEASUREMENT_LIST_SCOPES = ["mine", "all"] as const;
export type MeasurementListScope = (typeof MEASUREMENT_LIST_SCOPES)[number];
export const MEASUREMENT_DEVICE_INCLUDES = ["owner"] as const;
export const MEASUREMENT_DEVICE_SORTS = ["-createdAt", "createdAt", "weight", "-weight"] as const;
export const MEASUREMENT_UPLOAD_INCLUDES = ["uploader", "device"] as const;
export const MEASUREMENT_UPLOAD_SORTS = ["-receivedAt", "receivedAt", "-updatedAt", "updatedAt"] as const;

export const plmnCodeSchema = z.string().regex(/^\d{5,6}$/, "Must be the network code as 5 or 6 digits, for example 26006");
const integerSchema = z.number().int();
const positionSchema = z.number().int().nonnegative();
const simSlotSchema = z.number().int().nonnegative();
const elapsedMillisSchema = z.number().int().nonnegative().describe("Milliseconds of `SystemClock.elapsedRealtime()`");
const kilohertzSchema = z.number().int().positive();
const nameSchema = z.string().trim().min(1).max(64);
const reasonSchema = z.string().trim().min(1).max(500);
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
  plmn: plmnCodeSchema.optional().describe("The cell's network. For a shared cell, its primary network"),
  additionalPlmns: z
    .array(plmnCodeSchema)
    .max(12)
    .optional()
    .describe("The other networks a shared cell broadcasts. An empty list means the phone read it and there were none. Leave it out when unknown"),
  bands: bandsSchema.optional(),
  isBarred: z.boolean().optional().describe("From the modem's system information"),
  reservedForOperatorUsePlmns: z
    .array(plmnCodeSchema)
    .max(12)
    .optional()
    .describe("The networks for which the cell is reserved. An empty list means none"),
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
  supportsEndc: z.boolean().optional().describe("Whether the cell offers 5G NSA"),
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
      .describe("Serving cell only: the services the cell bars. An empty object means nothing is barred. Leave it out when it was not read"),
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
  registeredPlmn: plmnCodeSchema.optional().describe("The network the SIM is registered on, when it differs from `sims`"),
  isRoaming: z.boolean().optional().describe("Android's roaming flag, when it differs from `sims`"),
  isNrAvailable: z.boolean().optional(),
  isDcNrRestricted: z.boolean().optional(),
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
  usesShizuku: z.boolean().optional(),
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
        "`true` when the upload starts during a trip that began at least 100 m earlier along the track. A trip ends at a stop or a five-minute gap. Left out, public trails skip the upload's first 100 m",
      ),
    endsMidTrip: z
      .boolean()
      .optional()
      .describe(
        "`true` when the trip went on for at least 100 m along the track after the upload ended, so send it once you know. Left out, public trails skip its last 100 m",
      ),
    sims: z
      .array(
        z.object({
          slot: simSlotSchema,
          simPlmn: plmnCodeSchema.optional().describe("The SIM's own network"),
          registeredPlmn: plmnCodeSchema.optional().describe("The network the SIM is registered on"),
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
    "The JSON document inside the compressed body of `PUT /measurements/uploads/{id}`. " +
      "Values out of range are dropped one by one when the upload is processed, without rejecting the upload",
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
  acceptedVersion: z.number().int().positive().nullable(),
  acceptedAt: z.iso.datetime().nullable(),
});
export type MeasurementTerms = z.infer<typeof measurementTermsSchema>;

export const measurementTermsAcceptSchema = z
  .object({ version: z.number().int().positive().describe("`currentVersion` from `GET /measurements/terms`") })
  .strict();
export type MeasurementTermsAccept = z.infer<typeof measurementTermsAcceptSchema>;

export const measurementListingSchema = z.object({
  isListed: z.boolean().describe("Whether you chose to appear in the leaderboards"),
  listedAt: z.iso.datetime().nullable().describe("When you agreed, `null` while you are not listed"),
  hasPublicProfile: z.boolean().describe("The boards show only people with a public profile"),
});
export type MeasurementListing = z.infer<typeof measurementListingSchema>;

export const measurementListingUpdateSchema = z.object({ isListed: z.boolean() }).strict();
export type MeasurementListingUpdate = z.infer<typeof measurementListingUpdateSchema>;

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
        .describe(
          "`strong`: the key is in the phone's secure hardware, the phone is locked and booted verified, and the BTSearch app made the key. " +
            "`hardware`: the key is in secure hardware, but the bootloader is unlocked or the boot is not verified. " +
            "`software`: the attestation cannot be trusted, because the key is in software, its chain has an unknown root or a revoked certificate, " +
            "or another app made the key. `none`: the device was registered without an attestation chain. " +
            "The tier can drop later, for example when one of the key's certificates is revoked. The other fields are read once, at registration",
        ),
      securityLevel: z.enum(ATTESTATION_SECURITY_LEVELS).nullable(),
      verifiedBootState: z.enum(VERIFIED_BOOT_STATES).nullable(),
      isBootloaderLocked: z.boolean().nullable(),
    })
    .describe("What the key's attestation says about the phone. `null` fields were not in it"),
  revocation: z
    .object({
      reason: z.string().nullable().describe("Written by an administrator who revoked the device"),
      by: userRefSchema
        .nullable()
        .optional()
        .describe("Administrators only. The device's owner or the administrator who revoked it. `null` once that account is deleted"),
      at: z.iso.datetime(),
    })
    .nullable(),
  createdAt: z.iso.datetime(),
  lastUploadAt: z.iso.datetime().nullable(),
  software: z
    .object({
      sdkInt: z.number().int(),
      securityPatch: z.iso.date().nullable(),
      radioVersion: z.string().nullable().describe("The modem firmware version"),
      appVersionCode: z.number().int(),
      appVersionName: z.string(),
    })
    .nullable()
    .describe("What the phone ran for its latest processed upload. `null` until one is processed"),
  timingAdvance: z
    .array(
      z.object({
        source: z.enum(MEASUREMENT_READER_SOURCES),
        rat: z.enum(TIMING_ADVANCE_RATS),
        metersPerStep: z.number(),
        offsetMeters: z.number(),
      }),
    )
    .describe(
      "How this phone's timing advance turns into meters, as calibrated against the stations in the database over the last 7 nights: " +
        "a distance is `timingAdvance * metersPerStep + offsetMeters`. A source and technology that is not listed has no calibration yet. " +
        "Use 3GPP's step for it, with no offset: 553.46 m for GSM, 78.07 m for LTE and 9.76 m for NR read from the modem. " +
        "NR read through Android's API gives no distance until it is calibrated",
    ),
  weight: z
    .object({
      computed: z.number().describe("From the device's tier and track record"),
      effective: z.number().describe("What its next uploads count with"),
      basis: z.enum(MEASUREMENT_WEIGHT_BASES).describe("Where `effective` comes from: the device's own weight, its owner's vouch, or `computed`"),
      own: z
        .object({ value: z.number(), reason: z.string(), by: userRefSchema.nullable(), at: z.iso.datetime() })
        .nullable()
        .describe("The weight an administrator set on the device itself. `null` while it has none"),
    })
    .optional()
    .describe("Administrators only"),
  owner: userRefSchema.nullable().optional().describe("Administrators only, with `include=owner`. `null` once the account is deleted"),
});
export type MeasurementDevice = z.infer<typeof measurementDeviceSchema>;
export type MeasurementDeviceTimingAdvance = MeasurementDevice["timingAdvance"][number];
export type MeasurementDeviceWeight = NonNullable<MeasurementDevice["weight"]>;

export const measurementDeviceListQuerySchema = z
  .object({
    scope: z
      .enum(MEASUREMENT_LIST_SCOPES)
      .optional()
      .describe("`all` is for administrators. Left out, it is `mine`, or `all` when an administrator sends `ids` or `userIds`"),
    ids: csvUuidsSchema.optional(),
    userIds: csvUuidsSchema.optional().describe("Their owners"),
    sort: z
      .enum(MEASUREMENT_DEVICE_SORTS)
      .default("-createdAt")
      .describe("`weight` sorts by the computed weight, lowest first, and is for administrators"),
    include: csvEnumSchema(MEASUREMENT_DEVICE_INCLUDES).optional(),
    limit: limitSchema,
    cursor: cursorSchema.optional(),
    includeTotal: booleanQuerySchema.optional(),
  })
  .strict();

export type MeasurementDeviceListQuery = z.infer<typeof measurementDeviceListQuerySchema>;

export const measurementDeviceListSchema = z.object({ data: z.array(measurementDeviceSchema), paging: pagingSchema });
export type MeasurementDeviceList = z.infer<typeof measurementDeviceListSchema>;

const trustWeightSchema = z.number().min(0).max(2);

export const measurementDeviceUpdateSchema = z
  .object({
    label: nameSchema.nullable().optional().describe("Only the device's owner can change it"),
    isRevoked: z.boolean().optional().describe("You can revoke your own device. Only an administrator can restore one"),
    revocationReason: reasonSchema.optional().describe("Administrators only, with `isRevoked: true`. The device's owner sees it"),
    weight: z
      .object({ value: trustWeightSchema, reason: reasonSchema })
      .strict()
      .nullable()
      .optional()
      .describe(
        "Administrators only, in a request of its own. The weight this device's uploads count with, in place of the owner's vouch and the computed weight",
      ),
    refold: z
      .boolean()
      .optional()
      .describe(
        "With `weight`. Fold again the owner's uploads whose file is still kept, from each of their devices, with the weights they have after this change",
      ),
  })
  .strict()
  .refine(hasAnyField, AT_LEAST_ONE_FIELD_ISSUE)
  .refine((change) => change.revocationReason === undefined || change.isRevoked === true, {
    path: ["revocationReason"],
    error: "Send it with `isRevoked: true`",
  })
  .refine((change) => change.weight === undefined || (change.label === undefined && change.isRevoked === undefined), {
    path: ["weight"],
    error: "Send it in a request of its own",
  })
  .refine((change) => change.refold === undefined || change.weight !== undefined, { path: ["refold"], error: "Send it with `weight`" });
export type MeasurementDeviceUpdate = z.infer<typeof measurementDeviceUpdateSchema>;

export const measurementUploadParamsSchema = z.object({
  id: z.uuidv7().describe("The app makes it when it closes the batch. The time in the UUIDv7 must lie between 120 days ago and one day ahead"),
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
  status: z.enum(MEASUREMENT_UPLOAD_STATUSES).describe("Goes from `received` through `processing` to `processed` or `rejected`"),
  rejectionReason: z.enum(MEASUREMENT_REJECTION_REASONS).nullable(),
  exclusion: z
    .object({
      reason: z.string(),
      by: userRefSchema.nullable().optional().describe("Administrators only. `null` once that account is deleted"),
      at: z.iso.datetime(),
    })
    .nullable(),
  contentType: z.enum(MEASUREMENT_CONTENT_TYPES),
  sizeBytes: z.number().int().describe("The size of the compressed body"),
  receivedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime().describe("When the status last changed"),
  attempts: z.number().int().describe("How often processing started. An upload whose processing keeps failing is rejected with `processingFailed`"),
  result: z
    .object({
      processedAt: z.iso.datetime(),
      startedAt: z.iso.datetime().nullable().describe("The time of the first reading kept"),
      endedAt: z.iso.datetime().nullable().describe("The time of the last reading kept"),
      bbox: z.object({ west: z.number(), south: z.number(), east: z.number(), north: z.number() }).nullable().describe("Around the readings kept"),
      samples: z.object({
        total: z.number().int(),
        kept: z.number().int(),
        distanceOnly: z
          .number()
          .int()
          .describe("Readings kept without a signal level, whose timing advance still gives a distance. They are counted in `kept`"),
        dropped: z.partialRecord(z.enum(MEASUREMENT_DROP_REASONS), z.number().int().positive()).describe("Counts by reason"),
        closedCountryCodes: z.array(z.string()).describe("The countries behind `dropped.closedCountry`, where measuring was switched off"),
      }),
      discoveries: z
        .object({ cells: z.number().int(), sites: z.number().int(), squares: z.number().int() })
        .describe("The cells, sites and squares this upload measured before anyone else"),
    })
    .nullable()
    .describe(
      "`null` until the upload is processed, and again once it is withdrawn or excluded. " +
        "An upload rejected with `noSamples` has one too, to show why its readings were dropped. Its `startedAt`, `endedAt` and `bbox` are `null`",
    ),
  fileExpiresAt: z.iso.datetime().nullable().describe("When the raw file is due to be deleted. `null` once it is gone"),
  uploader: userRefSchema.nullable().optional().describe("Administrators only, with `include=uploader`. `null` once the account is deleted"),
  device: measurementDeviceSchema.optional().describe("Only returned with `include=device`"),
});
export type MeasurementUpload = z.infer<typeof measurementUploadSchema>;

export const measurementUploadListQuerySchema = z
  .object({
    scope: z
      .enum(MEASUREMENT_LIST_SCOPES)
      .optional()
      .describe("`all` is for administrators. Left out, it is `mine`, or `all` when an administrator sends `userIds` or `deviceIds`"),
    userIds: csvUuidsSchema.optional().describe("The people who sent them"),
    deviceIds: csvUuidsSchema.optional(),
    statuses: csvEnumSchema(MEASUREMENT_UPLOAD_STATUSES).optional(),
    receivedAfter: instantSchema.optional().describe("Only uploads received at or after this time"),
    updatedAfter: instantSchema.optional().describe("Only uploads whose status changed at or after this time"),
    sort: z.enum(MEASUREMENT_UPLOAD_SORTS).default("-receivedAt"),
    include: csvEnumSchema(MEASUREMENT_UPLOAD_INCLUDES).optional(),
    limit: limitSchema,
    cursor: cursorSchema.optional(),
    includeTotal: booleanQuerySchema.optional(),
  })
  .strict();

export type MeasurementUploadListQuery = z.infer<typeof measurementUploadListQuerySchema>;

export const measurementUploadListSchema = z.object({ data: z.array(measurementUploadSchema), paging: pagingSchema });
export type MeasurementUploadList = z.infer<typeof measurementUploadListSchema>;

const exclusionReasonSchema = reasonSchema.describe("The person who sent the upload sees it");

export const measurementUploadUpdateSchema = z
  .object({
    status: z
      .literal("withdrawn")
      .optional()
      .describe("Only for your own uploads. Its readings stop counting within minutes, and its file is deleted within the hour after that"),
    exclusion: z
      .object({ reason: exclusionReasonSchema })
      .strict()
      .nullable()
      .optional()
      .describe(
        "Administrators only. An object excludes the upload and keeps its file until it expires, as evidence. " +
          "`null` restores an excluded upload while its file is kept: it counts again, and is folded now if it never was",
      ),
  })
  .strict()
  .refine(hasAnyField, AT_LEAST_ONE_FIELD_ISSUE)
  .refine((change) => change.status === undefined || change.exclusion === undefined, {
    path: ["exclusion"],
    error: "Send either `status` or `exclusion`, not both",
  });
export type MeasurementUploadUpdate = z.infer<typeof measurementUploadUpdateSchema>;

export const measurementUploadConflictSchema = z.object({ kind: z.enum(["withdrawn", "excluded", "notExcluded"]) });
export type MeasurementUploadConflict = z.infer<typeof measurementUploadConflictSchema>;

export const measurementUploadFileGoneSchema = z.object({ kind: z.literal("fileDeleted") });

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

const readingBlockPhonesSchema = z
  .union([
    z.object({ modemFamily: z.enum(MEASUREMENT_MODEM_FAMILIES) }).strict(),
    z.object({ socId: z.number().int().positive() }).strict(),
    z.object({ deviceModelId: z.number().int().positive() }).strict(),
    z.object({ readerVersionId: z.number().int().positive() }).strict(),
  ])
  .describe("The phones it applies to, by one modem family, SoC, device model or reader version");

const readingBlockModeSchema = z
  .enum(READING_BLOCK_MODES)
  .describe(
    "`drop` discards the fields, or the whole reading. `corroborate` holds them back until a phone outside the block, or the matched cell in the database, shows the same value. " +
      "`corroborate` takes only `pci`, `channel`, `areaCode` and `bandwidth`",
  );

const sdkIntSchema = z.number().int().min(1).max(1000);

export const measurementReadingBlockSchema = z.object({
  id: z.number().int(),
  phones: readingBlockPhonesSchema,
  technologies: z.array(z.enum(CELL_RATS)).nullable().describe("`null` for all"),
  roles: z.array(z.enum(READING_BLOCK_ROLES)).nullable().describe("`null` for all"),
  sdkIntMin: z.number().int().nullable(),
  sdkIntMax: z.number().int().nullable(),
  radioVersionPrefix: z.string().nullable(),
  fields: z.array(z.enum(READING_BLOCK_FIELDS)).nullable().describe("`null` for the whole reading: every cell and value in it"),
  mode: readingBlockModeSchema,
  reason: z.string(),
  createdBy: userRefSchema.nullable(),
  createdAt: z.iso.datetime(),
  isEnabled: z.boolean(),
  disabledBy: userRefSchema.nullable(),
  disabledAt: z.iso.datetime().nullable(),
});
export type MeasurementReadingBlock = z.infer<typeof measurementReadingBlockSchema>;

export const measurementReadingBlockListSchema = z.object({ data: z.array(measurementReadingBlockSchema) });

export const measurementReadingBlockParamsSchema = z.object({ id: idParamSchema });

export const measurementReadingBlockCreateSchema = z
  .object({
    phones: readingBlockPhonesSchema,
    technologies: z.array(z.enum(CELL_RATS)).min(1).optional(),
    roles: z
      .array(z.enum(READING_BLOCK_ROLES))
      .min(1)
      .optional()
      .describe("`serving` also covers aggregated carriers, and `nsa` the NR carrier of an NSA connection (`nrSecondary` readings)"),
    sdkIntMin: sdkIntSchema.optional(),
    sdkIntMax: sdkIntSchema.optional(),
    radioVersionPrefix: z.string().trim().min(1).max(128).optional(),
    fields: z.array(z.enum(READING_BLOCK_FIELDS)).min(1).optional().describe("Leave it out to drop whole readings"),
    mode: readingBlockModeSchema,
    reason: reasonSchema,
    refold: z.boolean().default(false).describe("Also fold again the uploads it applies to whose file is still kept"),
  })
  .strict()
  .refine((block) => block.fields !== undefined || (block.mode === "drop" && block.technologies === undefined && block.roles === undefined), {
    path: ["fields"],
    error: "A block of whole readings takes `drop` and no `technologies` or `roles`",
  })
  .refine(
    (block) =>
      block.mode === "drop" ||
      block.fields === undefined ||
      block.fields.every((field) => (READING_BLOCK_HELD_FIELDS as readonly string[]).includes(field)),
    { path: ["fields"], error: "`corroborate` takes only `pci`, `channel`, `areaCode` and `bandwidth`" },
  )
  .refine((block) => block.sdkIntMin === undefined || block.sdkIntMax === undefined || block.sdkIntMin <= block.sdkIntMax, {
    path: ["sdkIntMax"],
    error: "Must not be below `sdkIntMin`",
  });
export type MeasurementReadingBlockCreate = z.infer<typeof measurementReadingBlockCreateSchema>;

export const measurementReadingBlockUpdateSchema = z
  .object({
    reason: reasonSchema.optional(),
    isEnabled: z.boolean().optional(),
    refold: z.boolean().optional().describe("Fold again the uploads it acted on or now applies to, if their file is still kept"),
  })
  .strict()
  .refine(hasAnyField, AT_LEAST_ONE_FIELD_ISSUE);
export type MeasurementReadingBlockUpdate = z.infer<typeof measurementReadingBlockUpdateSchema>;

export const measurementReaderVersionSchema = z.object({
  id: z.number().int(),
  reader: z.string().describe("The reader's `name` in uploads"),
  source: z.enum(MEASUREMENT_READER_SOURCES),
  version: z.string(),
  firstSeenAt: z.iso.datetime(),
});
export type MeasurementReaderVersion = z.infer<typeof measurementReaderVersionSchema>;

export const measurementReaderVersionListSchema = z.object({ data: z.array(measurementReaderVersionSchema) });

export const measurementSocSchema = z.object({
  id: z.number().int(),
  manufacturer: z.string(),
  model: z.string(),
  modemFamily: z.enum(MEASUREMENT_MODEM_FAMILIES),
});
export type MeasurementSoc = z.infer<typeof measurementSocSchema>;

export const measurementSocListSchema = z.object({ data: z.array(measurementSocSchema) });

export const measurementDeviceModelSchema = z.object({
  id: z.number().int(),
  manufacturer: z.string(),
  model: z.string(),
  socId: z.number().int().nullable().describe("The SoC the phone names, or else the one its board is known to have"),
});
export type MeasurementDeviceModel = z.infer<typeof measurementDeviceModelSchema>;

export const measurementDeviceModelListQuerySchema = z
  .object({
    q: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .refine((value) => !value.includes("\u0000"), { message: "Must not contain a null character" })
      .optional()
      .describe("Matches part of the manufacturer followed by the model, for example `google pixel`. Letter case is ignored"),
    ids: csvIdsSchema.optional(),
    limit: limitSchema,
    cursor: cursorSchema.optional(),
  })
  .strict();
export type MeasurementDeviceModelListQuery = z.infer<typeof measurementDeviceModelListQuerySchema>;

export const measurementDeviceModelListSchema = z.object({ data: z.array(measurementDeviceModelSchema), paging: pagingSchema });
export type MeasurementDeviceModelList = z.infer<typeof measurementDeviceModelListSchema>;

export const measurementQuirkRuleSchema = z.object({
  id: z.string(),
  reader: z.string(),
  firstSeenAt: z.iso.datetime(),
  block: z.object({ reason: z.string(), by: userRefSchema.nullable(), at: z.iso.datetime() }).nullable(),
});
export type MeasurementQuirkRule = z.infer<typeof measurementQuirkRuleSchema>;

export const measurementQuirkRuleListSchema = z.object({ data: z.array(measurementQuirkRuleSchema) });

export const measurementQuirkRuleParamsSchema = z.object({ id: z.string().min(1).max(64) });

export const measurementQuirkRuleUpdateSchema = z
  .object({
    block: z.object({ reason: reasonSchema }).strict().nullable().optional(),
    refold: z.boolean().optional().describe("Fold again the uploads the rule corrected or was skipped in, if their file is still kept"),
  })
  .strict()
  .refine(hasAnyField, AT_LEAST_ONE_FIELD_ISSUE);
export type MeasurementQuirkRuleUpdate = z.infer<typeof measurementQuirkRuleUpdateSchema>;

export const measurementContributorParamsSchema = z.object({ userId: z.uuid() });

export const measurementContributorSchema = z.object({
  user: userRefSchema,
  termsVersion: z.number().int().nullable().describe("The latest version of the contributor terms the person accepted"),
  firstUploadAt: z.iso.datetime().nullable(),
  deviceCount: z.number().int().describe("Revoked devices included"),
  revokedDeviceCount: z.number().int(),
  uploadCount: z.number().int().describe("Every upload received from them, whatever its status"),
  weight: z
    .object({
      computed: z.number().describe("From the tiers and track records of the person's devices"),
      effective: z
        .number()
        .describe(
          "What their next uploads count with: per device, the weight an administrator set on it, else `vouch.weight` while the vouch lasts, " +
            "else the computed weight",
        ),
    })
    .describe("Averages over the person's devices, weighted by the samples in their folded uploads"),
  trackRecord: z
    .object({
      timingAdvanceAgreement: z
        .number()
        .nullable()
        .describe("The share of timing-advance readings on confirmed stations that fit their distance. `null` until there are any"),
      droppedShare: z.number().describe("The share of readings dropped as implausible"),
      mockShare: z.number().describe("The share of readings taken with a mock location"),
      phantomCells: z.number().int().describe("Cells only this person reported where others measured the same network"),
    })
    .describe("From the latest nightly score of each of the person's devices"),
  vouch: z
    .object({
      weight: z.number().describe("Takes the place of the computed weight on each of their devices that has no weight of its own"),
      confirmsAlone: z.boolean().describe("Whether what the person alone saw counts as confirmed"),
      reason: z.string(),
      by: userRefSchema.nullable(),
      at: z.iso.datetime(),
      endsAt: z.iso.datetime().nullable(),
    })
    .nullable()
    .describe("`null` while nobody vouches for the person, also once the vouch's `endsAt` has passed"),
  block: z
    .object({
      reason: z.string(),
      by: userRefSchema.nullable(),
      at: z.iso.datetime(),
      endsAt: z.iso.datetime().nullable(),
    })
    .nullable()
    .describe("`null` while the person is not blocked, also once the block's `endsAt` has passed"),
});
export type MeasurementContributor = z.infer<typeof measurementContributorSchema>;

export const MEASUREMENT_CONTRIBUTOR_SORTS = ["weight", "-weight", "firstUploadAt", "-firstUploadAt"] as const;

export const measurementContributorListQuerySchema = z
  .object({
    isVouched: booleanQuerySchema.optional(),
    isBlocked: booleanQuerySchema.optional(),
    weightBelow: z.coerce.number<number>().min(0).max(2).optional().describe("Only people whose computed weight is below this"),
    sort: z
      .enum(MEASUREMENT_CONTRIBUTOR_SORTS)
      .default("weight")
      .describe("`weight` sorts by the computed weight, lowest first. People who never uploaded come last by `firstUploadAt`"),
    limit: limitSchema,
    cursor: cursorSchema.optional().describe("Weights change each night, so paging across a nightly run can repeat or skip people"),
    includeTotal: booleanQuerySchema.optional(),
  })
  .strict();
export type MeasurementContributorListQuery = z.infer<typeof measurementContributorListQuerySchema>;

export const measurementContributorListSchema = z.object({ data: z.array(measurementContributorSchema), paging: pagingSchema });
export type MeasurementContributorList = z.infer<typeof measurementContributorListSchema>;

export const measurementContributorUpdateSchema = z
  .object({
    vouch: z
      .object({
        weight: trustWeightSchema.describe("Above 1, their readings count for more than an attested phone's"),
        confirmsAlone: z.boolean().default(false).describe("Lets what the person alone saw count as confirmed"),
        reason: reasonSchema,
        endsAt: instantSchema.optional().describe("Without it, the vouch lasts until withdrawn"),
      })
      .strict()
      .nullable()
      .optional()
      .describe("Sets the weight of every device of theirs that has none of its own"),
    block: z
      .object({ reason: reasonSchema, endsAt: instantSchema.optional().describe("Without it, the block lasts until lifted") })
      .strict()
      .nullable()
      .optional()
      .describe("Refuses their uploads. Send it without `vouch`"),
    refold: z.boolean().optional().describe("Fold again their uploads whose file is still kept, with the weight they have after this change"),
  })
  .strict()
  .refine(hasAnyField, AT_LEAST_ONE_FIELD_ISSUE)
  .refine((change) => change.vouch === undefined || change.block === undefined, { path: ["block"], error: "Send it in a request of its own" });
export type MeasurementContributorUpdate = z.infer<typeof measurementContributorUpdateSchema>;

export const measurementSummarySchema = z.object({
  uploads: z.number().int().describe("Your uploads whose readings count now: processed, and neither withdrawn nor excluded"),
  samples: z.number().int().describe("The samples they kept"),
  newSquares: z.number().int().describe("Squares nobody had measured before you"),
  discoveries: z.object({ cells: z.number().int(), sites: z.number().int() }).describe("The cells and sites they found first"),
  firstUploadAt: z.iso.datetime().nullable().describe("When the first of them was received"),
  lastUploadAt: z.iso.datetime().nullable().describe("When the latest of them was received"),
  countries: z
    .array(z.object({ countryCode: z.string(), samples: z.number().int(), newSquares: z.number().int() }))
    .describe(
      "Per country the samples were taken in, most samples first. Samples outside every country are left out. " +
        "`samples` here is counted as the engine folds, so a withdrawn upload leaves it within minutes",
    ),
  ranks: z
    .array(
      z.object({
        countryCode: z.string(),
        startsOn: z.iso.date().nullable().describe("The first day of this month, or `null` for all time"),
        rank: z.number().int().positive(),
      }),
    )
    .describe("Your place on the leaderboards, all time and this month, in each country where you are listed. Empty while you are not"),
});
export type MeasurementSummary = z.infer<typeof measurementSummarySchema>;
