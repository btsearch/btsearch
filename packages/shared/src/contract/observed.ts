import { z } from "zod/v4";

import { csvBandIdsSchema } from "./bands.ts";
import { cellApplyChangeSchema } from "./cellApply.ts";
import { officialSiteRefSchema } from "./cellMatch.ts";
import { CELL_FIELD_NOTES, cellSchema } from "./cells.ts";
import {
  AT_LEAST_ONE_FIELD_ISSUE,
  INCLUDE_NOTE,
  bboxSchema,
  booleanQuerySchema,
  csvCountryCodesSchema,
  csvEnumSchema,
  csvIdsSchema,
  csvSchema,
  cursorSchema,
  daySchema,
  hasAnyField,
  idParamSchema,
  idSchema,
  instantSchema,
  limitSchema,
  pagingSchema,
  searchTextSchema,
  userRefSchema,
} from "./common.ts";
import {
  AREA_CLASSES,
  CELL_MATCHES_FOUND,
  CELL_NETWORK_MATCHES,
  CELL_RATS,
  ENGINE_RUN_OUTCOMES,
  EVALUATION_DIMENSIONS,
  EVIDENCE_CLASSES,
  type EngineRunKind,
  MAX_LOCATION_LIST_LIMIT,
  MEASUREMENT_MODEM_FAMILIES,
  MEASUREMENT_READER_SOURCES,
  MEASUREMENT_UPLOAD_STATUSES,
  OBSERVATION_FLAG_CLOSED_REASONS,
  OBSERVATION_FLAG_DISMISSED_REASONS,
  OBSERVATION_FLAG_KINDS,
  OBSERVED_SITE_CONFIDENCE,
  OBSERVED_SITE_STATUSES,
  type ObservedSiteStatus,
  READING_BLOCK_FIELDS,
  SNAP_CANDIDATE_KINDS,
  STATION_HALVES,
  TIMING_ADVANCE_RATS,
  VALUE_PATTERNS,
} from "./constants.ts";
import { boundingBoxSchema } from "./countries.ts";
import { measurementReadingBlockSchema, plmnCodeSchema } from "./measurements.ts";
import { stationCreateSchema } from "./stationEdits.ts";
import { KEEP_OTHER_COUNTRIES_LEAD, areaFilterShape, locationSchema, stationSchema } from "./stations.ts";

export const NIGHTLY_ENGINE_RUN_KINDS = ["recalibrate", "evaluate"] as const satisfies readonly EngineRunKind[];

export const engineRunProgressSchema = z.object({
  done: z.number().int(),
  total: z.number().int().nullable().describe("`null` when the run cannot tell in advance"),
  failed: z.number().int().describe("Uploads the run could not process. `error` names them"),
});

const NO_PARAMS = z.object({}).strict();
const REFOLD_SCOPES = [
  z.object({ userId: z.uuid() }).strict(),
  z.object({ deviceModelId: idSchema }).strict(),
  z.object({ readingBlockId: z.number().int().positive().max(32_767) }).strict(),
  NO_PARAMS,
] as const;
const REFOLD_SCOPE_NOTE = "Of the uploads whose file is still kept: all, or one person's, one device model's or one reading block's";
const GNB_LENGTHS_NOTE = "Also test each network's gNBID length, as the nightly run does on Sundays";
const trailAreaSchema = boundingBoxSchema.refine((area) => area.west < area.east, { path: ["east"], message: "Must be greater than west" });

function engineRunOf<const Kind extends EngineRunKind, Params extends z.ZodType>(kind: Kind, params: Params) {
  return z.object({
    id: z.uuid(),
    kind: z.literal(kind),
    params,
    requestedBy: userRefSchema.nullable().describe("`null` for a run the server or the engine queued"),
    createdAt: z.iso.datetime(),
    startedAt: z.iso.datetime().nullable(),
    finishedAt: z.iso.datetime().nullable(),
    outcome: z.enum(ENGINE_RUN_OUTCOMES).nullable().describe("`null` until it finishes. A run the engine crashed in stays started and unfinished"),
    progress: engineRunProgressSchema.nullable(),
    error: z.string().nullable(),
  });
}

export const engineRunSchema = z.discriminatedUnion("kind", [
  engineRunOf("subtract", NO_PARAMS),
  engineRunOf("restore", NO_PARAMS),
  engineRunOf(
    "refold",
    z.union([...REFOLD_SCOPES, z.object({ quirkRuleId: z.string() }).strict()]).describe(`${REFOLD_SCOPE_NOTE}, or those a quirk rule touches`),
  ),
  engineRunOf("rebuild", z.object({ uploadId: z.uuid() }).strict()),
  engineRunOf("reestimate", NO_PARAMS),
  engineRunOf("recalibrate", NO_PARAMS),
  engineRunOf("evaluate", z.object({ gnbLengths: z.boolean().describe(GNB_LENGTHS_NOTE) }).strict()),
  engineRunOf("rebuildTrails", trailAreaSchema),
  engineRunOf("rebuildReadModels", NO_PARAMS),
]);
export type EngineRun = z.infer<typeof engineRunSchema>;

export const engineRunParamsSchema = z.object({ id: z.uuid() });

export const engineRunCreateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("refold"), params: z.union(REFOLD_SCOPES).default({}).describe(REFOLD_SCOPE_NOTE) }).strict(),
  z
    .object({ kind: z.literal("reestimate") })
    .strict()
    .describe("Estimates every site again"),
  z.object({ kind: z.literal("recalibrate") }).strict(),
  z
    .object({
      kind: z.literal("evaluate"),
      params: z
        .object({ gnbLengths: z.boolean().default(false).describe(GNB_LENGTHS_NOTE) })
        .strict()
        .default({ gnbLengths: false }),
    })
    .strict(),
  z.object({ kind: z.literal("rebuildTrails"), params: trailAreaSchema }).strict(),
  z.object({ kind: z.literal("rebuildReadModels") }).strict(),
]);
export type EngineRunCreate = z.infer<typeof engineRunCreateSchema>;

export const engineStateSchema = z.object({
  instances: z
    .array(z.object({ instance: z.string(), startedAt: z.iso.datetime(), seenAt: z.iso.datetime() }))
    .describe("Each engine process with its latest heartbeat, newest first. A running engine sends one every 15 seconds"),
  uploads: z.object({
    waiting: z.number().int().describe("Uploads `received` or `processing`"),
    oldestWaitingAt: z.iso.datetime().nullable().describe("When the oldest of them was received"),
    subtractionsWaiting: z.number().int().describe("Withdrawn or excluded uploads whose readings are still counted"),
    processedLastDay: z.number().int().describe("In the last 24 hours"),
    rejectedLastDay: z.number().int().describe("In the last 24 hours"),
  }),
  sitesWaiting: z.number().int().describe("Sites marked for a new estimate"),
  storage: z.object({
    storedBytes: z.number().int().describe("The raw files still kept"),
    budgetBytes: z.number().int(),
    disk: z
      .object({ freeBytes: z.number().int(), totalBytes: z.number().int() })
      .nullable()
      .describe("The disk new uploads are stored on. `null` when they are not stored on a local disk"),
  }),
  databaseBytes: z.number().int().describe("The size of the measurement tables, indexes included"),
  latestErrors: z
    .array(
      z.object({
        uploadId: z.uuid(),
        status: z.enum(MEASUREMENT_UPLOAD_STATUSES),
        attempts: z.number().int(),
        error: z.string(),
        receivedAt: z.iso.datetime(),
      }),
    )
    .describe("The latest uploads whose processing failed, whether retried or rejected. A run's error is on the run"),
  nightlyRuns: z.array(engineRunSchema).describe("The latest `recalibrate` and `evaluate` runs, newest first"),
  recentRuns: z.array(engineRunSchema).describe("The latest runs of the other kinds, newest first"),
});
export type EngineState = z.infer<typeof engineStateSchema>;

const countSchema = z.number().int().nonnegative();
const deviceModelRefSchema = z.object({ id: z.number().int(), manufacturer: z.string(), model: z.string() });
const readerVersionSchema = z.object({ id: z.number().int(), reader: z.string(), source: z.enum(MEASUREMENT_READER_SOURCES), version: z.string() });

export const evaluationScoreSchema = z.object({
  algorithmVersion: z
    .number()
    .int()
    .describe("The estimator's version. `0` is the baseline: the weighted center of the squares where the site served"),
  sites: countSchema.describe("Estimated sites matched to a station of the scored half"),
  errorMeters: z
    .object({ p50: countSchema, p80: countSchema, p95: countSchema })
    .describe("Percentiles of the distance from the fit, before any snapping, to the station's location"),
  insideRadius: countSchema.nullable().describe("Sites whose station lies inside the 95 % radius. `null` for the baseline, which has no radius"),
  ambiguous: countSchema.nullable().describe("Sites whose fit had a second likely point. `null` for the baseline"),
});
export type EvaluationScore = z.infer<typeof evaluationScoreSchema>;

export const observationEvaluationSchema = z.object({
  id: z.number().int(),
  runAt: z.iso.datetime(),
  scoredHalf: z
    .enum(STATION_HALVES)
    .describe("The stations scored, by whether their id is even or odd. The night's calibration learned from the other half only"),
  groundTruthStations: countSchema.describe("Confirmed stations of the scored half"),
  calibrationId: z.number().int().nullable().describe("The newest calibration the night used. `null` once it is deleted"),
  overall: z.array(evaluationScoreSchema).describe("One score per version, over every scored site, newest version first"),
});
export type ObservationEvaluation = z.infer<typeof observationEvaluationSchema>;

export const observationEvaluationDetailSchema = observationEvaluationSchema.extend({
  breakdown: z
    .array(evaluationScoreSchema.extend({ dimension: z.enum(EVALUATION_DIMENSIONS).exclude(["all"]), value: z.string() }))
    .describe(
      "The same scores per technology (`rat`), `areaClass`, `evidenceClass`, timing-advance group (`taGroup`), `reader` version and `country`. " +
        "For `taGroup` and `reader`, `value` is an id listed in `taGroups` or `readerVersions`, or `none` for sites read without one. " +
        "A technology is `unknown` for a station's site whose cells cannot tell it",
    ),
  snapping: z
    .array(
      z.object({
        algorithmVersion: z.number().int(),
        kind: z.enum(SNAP_CANDIDATE_KINDS).exclude(["none"]),
        possible: countSchema.describe("Sites whose station stands at a place of this kind near the fit"),
        right: countSchema.describe("Sites that snapped to a place of this kind where their station stands"),
        wrong: countSchema.describe("Sites that snapped to a place of this kind where their station does not stand"),
        missed: countSchema.describe("Of the `possible` sites, those that did not snap to their station's place"),
      }),
    )
    .describe("Snaps per kind of place a site can snap to"),
  snappingBands: z
    .array(
      z.object({
        algorithmVersion: z.number().int(),
        fromProbability: z.number(),
        toProbability: z.number(),
        snaps: countSchema.describe("Sites that snapped with a probability in this band"),
        right: countSchema.describe("Of them, the sites that snapped to where their station stands"),
      }),
    )
    .describe("Snaps by their probability, in tenths, and how many of them were right"),
  grouping: z
    .array(
      z.object({
        algorithmVersion: z.number().int(),
        groups: countSchema.describe("Groups of matched sites fitted as one mast"),
        right: countSchema.describe("Groups whose members' stations all stand at one location"),
        wrong: countSchema.describe("The other groups"),
        missed: countSchema.describe("Stations whose sites were left in more than one group"),
      }),
    )
    .describe("How sites of one mast were grouped"),
  readers: z
    .array(
      z.object({
        readerVersionId: z.number().int(),
        uploads: countSchema,
        timingAdvance: z
          .object({ onConfirmed: countSchema, withinTolerance: countSchema })
          .describe("Timing advances read on confirmed stations, and those that fit the distance"),
        values: z.object({ agreed: countSchema, differed: countSchema }).describe("Values compared with the confirmed cells' values"),
        onlyCells: countSchema.describe("Cells that only this reader version reported"),
      }),
    )
    .describe("Per reader version, over the uploads processed in the last 365 days"),
  gnbLengths: z
    .array(
      z.object({
        plmn: z.string(),
        length: z.number().int().describe("A gNBID length in bits"),
        isCutLength: z.boolean().describe("Whether it is the length the network's NR cells are cut with now"),
        isSuggested: z
          .boolean()
          .describe(
            "Whether it is the length the test suggests for the network: the shortest whose pairs together minus pairs apart " +
              "come within 95 % of the best length's. No length is suggested when none has more pairs together than apart",
          ),
        cells: countSchema,
        together: countSchema.describe("Pairs of cells with the same gNBID at this length that phones saw close together"),
        apart: countSchema.describe("Pairs of cells with the same gNBID at this length that phones saw far apart"),
        sites: countSchema.describe("How many gNBIDs the cells split into at this length"),
      }),
    )
    .describe("How each network's NR cells group by gNBID at each length from 22 to 32 bits. Tested on Sundays, so empty on other nights"),
  taGroups: z
    .array(
      z.object({
        id: z.number().int(),
        source: z.enum(MEASUREMENT_READER_SOURCES),
        modemFamily: z.enum(MEASUREMENT_MODEM_FAMILIES).nullable().describe("`null` for a group of one device model"),
        deviceModel: deviceModelRefSchema.nullable().describe("`null` for a group of one modem family"),
      }),
    )
    .describe("Every timing-advance group the night names"),
  readerVersions: z.array(readerVersionSchema).describe("Every reader version the night names"),
  calibration: z
    .object({
      id: z.number().int(),
      runAt: z.iso.datetime(),
      fittedHalf: z.enum(STATION_HALVES).describe("The stations it learned from"),
      timingAdvance: z
        .array(
          z.object({
            taGroupId: z.number().int(),
            rat: z.enum(TIMING_ADVANCE_RATS),
            scale: z.number(),
            offsetMeters: z.number(),
            rows: countSchema,
            stations: countSchema,
          }),
        )
        .describe("The distance read at 3GPP's step is `scale × distance + offsetMeters`. A group read as a round trip comes out near 2"),
      errorModels: z
        .array(
          z.object({
            taGroupId: z.number().int(),
            rat: z.enum(TIMING_ADVANCE_RATS),
            areaClass: z.enum(AREA_CLASSES),
            sigmaMeters: z.number(),
            tailMeanMeters: z.number(),
            outlierShare: z.number(),
            rows: countSchema,
          }),
        )
        .describe(
          "How far the distance a timing advance gives lies from the station: a normal spread of `sigmaMeters`, " +
            "a tail towards longer distances with a mean of `tailMeanMeters`, and the share of readings that fit nowhere, `outlierShare`",
        ),
      levelModels: z
        .array(
          z.object({
            rat: z.enum(CELL_RATS),
            areaClass: z.enum(AREA_CLASSES),
            slopeDbPerDecade: z.number(),
            scatterDb: z.number(),
            squares: countSchema,
          }),
        )
        .describe("How the level falls with distance: `slopeDbPerDecade` for each tenfold distance, with a spread of `scatterDb` around it"),
      ellipseScales: z.array(z.object({ evidenceClass: z.enum(EVIDENCE_CLASSES), isSurrounded: z.boolean(), scale: z.number(), sites: countSchema })),
      snapPriors: z.array(z.object({ kind: z.enum(SNAP_CANDIDATE_KINDS), isSameOperator: z.boolean(), prior: z.number() })),
    })
    .nullable()
    .describe("The calibration run the night used, with what that run fitted. `null` once the run is deleted"),
});
export type ObservationEvaluationDetail = z.infer<typeof observationEvaluationDetailSchema>;

export const observationEvaluationListQuerySchema = z
  .object({ limit: limitSchema, cursor: cursorSchema.optional(), includeTotal: booleanQuerySchema.optional() })
  .strict();
export type ObservationEvaluationListQuery = z.infer<typeof observationEvaluationListQuerySchema>;

export const observationEvaluationListSchema = z.object({ data: z.array(observationEvaluationSchema), paging: pagingSchema });
export type ObservationEvaluationList = z.infer<typeof observationEvaluationListSchema>;

export const observationEvaluationParamsSchema = z.object({ id: idParamSchema });

const locationSnapTargetSchema = z.object({ kind: z.literal("location"), locationId: z.number().int() });
const officialSiteSnapTargetSchema = z.object({ kind: z.literal("officialSite"), officialSiteId: z.number().int() });
const observedSiteSnapTargetSchema = z.object({ kind: z.literal("observedSite"), observedSiteId: z.number().int() });

export const snapTargetSchema = z.discriminatedUnion("kind", [locationSnapTargetSchema, officialSiteSnapTargetSchema, observedSiteSnapTargetSchema]);
export type SnapTarget = z.infer<typeof snapTargetSchema>;

const pointSchema = z.object({ latitude: z.number(), longitude: z.number() });
const snapProbabilitySchema = z.number().describe("How likely the site stands at the place it snapped to");

const placeShape = { city: z.string().nullable(), address: z.string().nullable() };

export const observedSitePlacementSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("fit"),
    radiusMeters: z.number().int().describe("The circle around the point that holds the site with the probability `confidence`"),
    confidence: z.literal(OBSERVED_SITE_CONFIDENCE),
    ellipse: z
      .object({ majorMeters: z.number().int(), minorMeters: z.number().int(), azimuthDegrees: z.number().int() })
      .describe("The half axes of the ellipse that holds the site with the same probability, the long one's azimuth clockwise from north"),
    alternative: pointSchema.nullable().describe("A second likely point, when the readings fit two places"),
  }),
  locationSnapTargetSchema.extend({ probability: snapProbabilitySchema, ...placeShape }),
  officialSiteSnapTargetSchema.extend({ probability: snapProbabilitySchema, ...placeShape }),
  observedSiteSnapTargetSchema.extend({ probability: snapProbabilitySchema }),
]);
export type ObservedSitePlacement = z.infer<typeof observedSitePlacementSchema>;

const nullableIdentitySchema = z.number().int().nullable();

export const OBSERVED_SITE_NOT_PUBLIC_REASONS = [
  "replaced",
  "ignored",
  "notEstimated",
  "unconfirmed",
  "looseFit",
  "possibleSmallCell",
  "privateCountry",
] as const;
export type ObservedSiteNotPublicReason = (typeof OBSERVED_SITE_NOT_PUBLIC_REASONS)[number];

const STAFF_ONLY_NOTE = "Only returned to editors and administrators";

const observedSiteShape = {
  plmns: z.array(z.string()).describe("The network it was observed under, then the other networks its cells broadcast, as two people read them"),
  operatorId: z.number().int().nullable().describe("The operator of the first network"),
  guestOperatorIds: z.array(z.number().int()).describe("The operators of the other networks"),
  copyOfObservedSiteId: nullableIdentitySchema.describe(
    "Set on the same base station observed under another network. Its position, placement, evidence and status are those of that site",
  ),
  groupId: nullableIdentitySchema.describe(
    "Shared by the base stations fitted as one mast: the lowest of their ids. Each of them shows the group's position, placement, evidence and status. " +
      "It follows the group as it changes, so ask for the members again rather than keeping it",
  ),
  countryCode: z
    .string()
    .nullable()
    .describe("The country of the point shown, or of its network's operator when the point lies outside every region"),
  regionId: nullableIdentitySchema.describe("The region of the point shown"),
  latitude: z.number().nullable().describe("Where the site is shown: the fit, or the place it snapped to. `null` until it has an estimate"),
  longitude: z.number().nullable(),
  placement: observedSitePlacementSchema
    .nullable()
    .describe(
      "How sure the position is: a fit with its radius, or the place the site snapped to with a probability. `null` until it has an estimate",
    ),
  evidence: z
    .object({
      samples: countSchema,
      devices: countSchema,
      people: countSchema,
      squares: countSchema,
      timingAdvanceShare: z.number().describe("The share of samples with a timing advance"),
      angularCoverageDegrees: countSchema.describe("How much of the circle around the site the readings come from"),
      distinctDays: countSchema,
      maxDistanceMeters: countSchema.describe("The farthest reading from the site"),
    })
    .nullable()
    .describe("What the estimate rests on, a snapped site's included. `null` until it has an estimate"),
  status: z
    .enum(OBSERVED_SITE_STATUSES)
    .describe(
      "`matched` to a station, `suggested` for one by its cells, `unmatched`, `ignored` by an editor, " +
        "or `replaced` by the sites in `replacedByObservedSiteIds`",
    ),
  matchedStationId: nullableIdentitySchema.describe("The station the site is linked to, by the matcher or by an editor (`handLink`)"),
  suggestedStationId: nullableIdentitySchema,
  ignore: z
    .object({ reason: z.string(), by: userRefSchema.nullable().describe("`null` once the account is deleted"), at: z.iso.datetime() })
    .nullable()
    .optional()
    .describe(`Why an editor ignored the site, who and when. \`null\` unless \`status\` is \`ignored\`. ${STAFF_ONLY_NOTE}`),
  handLink: z
    .object({ stationId: z.number().int(), by: userRefSchema.optional().describe(STAFF_ONLY_NOTE), at: z.iso.datetime() })
    .nullable()
    .describe("A link an editor made by hand, which the matcher never changes. `null` for the matcher's own link, and when there is no link"),
  replacedByObservedSiteIds: z.array(z.number().int()).describe("The sites its cells moved to. Empty unless `status` is `replaced`"),
  isPublic: z
    .boolean()
    .describe(
      "Whether everyone may see the site. It is public when it matches a station, or when it is confirmed: by two people on different days, " +
        "by one person whose phone in the strongest attestation tier saw one of its cells on two separate trips, " +
        "or by a person an administrator lets confirm alone. " +
        "It also needs one likely point, readings that agree with each other, a snap with a probability of at least 0.5 or a radius small enough, " +
        "no editor's ignore, readings at least 300 m away while it matches no station, and a country and a network whose measurements are published",
    ),
  notPublicReasons: z
    .array(z.enum(OBSERVED_SITE_NOT_PUBLIC_REASONS))
    .describe(
      "Why `isPublic` is `false`, empty when it is `true`. `replaced` and `ignored` follow `status`, and `notEstimated` means no estimate yet. " +
        "`unconfirmed` means it matches no station and is not confirmed. " +
        "`looseFit` covers two likely points, readings that disagree, and a snap below 0.5 or a radius above the limit. " +
        "`possibleSmallCell` means it matches no station and every reading lies within 300 m, as with a small cell indoors. " +
        "`privateCountry` means its country or its network's country does not publish measurements",
    ),
  firstSeenOn: daySchema.nullable().describe("The first day phones measured one of its cells, in UTC. `null` when it holds no cells"),
  lastSeenOn: daySchema.nullable().describe("The latest day phones measured one of its cells, in UTC"),
  estimatedAt: z.iso.datetime().nullable(),
  algorithmVersion: z.number().int().describe("The estimator version shown"),
};

function observedSiteOf<Node extends z.ZodLiteral<string>, Identity extends z.ZodRawShape, Extra extends z.ZodRawShape>(
  node: Node,
  identity: Identity,
  extra: Extra,
) {
  return z.object({ id: z.number().int(), node, ...identity, ...observedSiteShape, ...extra });
}

function observedSiteUnion<Extra extends z.ZodRawShape>(extra: Extra) {
  return z.discriminatedUnion("node", [
    observedSiteOf(z.literal("enb"), { enbid: z.number().int() }, extra),
    observedSiteOf(
      z.literal("gnb"),
      { gnbid: z.number().int(), gnbidLength: nullableIdentitySchema.describe("The gNBID length its network's cells are cut with") },
      extra,
    ),
    observedSiteOf(
      z.literal("gsmCell").describe("A GSM cell that matches no station, as a site of its own"),
      { lac: z.number().int().describe(CELL_FIELD_NOTES.lac), cid: z.number().int().describe(CELL_FIELD_NOTES.cid) },
      extra,
    ),
    observedSiteOf(
      z.literal("umtsCell").describe("A UMTS cell that matches no station, as a site of its own"),
      { rnc: z.number().int().describe(CELL_FIELD_NOTES.rnc), cid: z.number().int().describe(CELL_FIELD_NOTES.cid) },
      extra,
    ),
    observedSiteOf(
      z.literal("station").describe("A station's own site, which holds that station's GSM and UMTS cells on this network"),
      { stationId: z.number().int().describe("`matchedStationId` names the same station once the matcher links the site") },
      extra,
    ),
  ]);
}

export const observedCellSiteSchema = observedSiteUnion({});
export type ObservedCellSite = z.infer<typeof observedCellSiteSchema>;

export const OBSERVED_CELL_INCLUDES = ["footprint", "edges", "observedSite"] as const;
export type ObservedCellInclude = (typeof OBSERVED_CELL_INCLUDES)[number];

export const OBSERVED_CELL_EDGE_KINDS = ["handedOver", "faded", "otherLayer", "unmeasured"] as const;

export const BEARING_DIFFERS_BY_DEGREES = 45;
export const NARROW_SPREAD_DEGREES = 120;

const coordinatesSchema = z.tuple([z.number(), z.number()]).describe("Longitude and latitude");

export const geoJsonPolygonSchema = z.object({ type: z.literal("Polygon"), coordinates: z.array(z.array(coordinatesSchema)) });
export const geoJsonMultiLineStringSchema = z.object({ type: z.literal("MultiLineString"), coordinates: z.array(z.array(coordinatesSchema)) });

const observedCellEdgeSchema = z.object({
  kind: z
    .enum(OBSERVED_CELL_EDGE_KINDS)
    .describe(
      "What lies beyond this part of the footprint: `handedOver` another cell of the network on the same channel, `faded` a signal below the usable level, " +
        "`otherLayer` the network on other channels only, `unmeasured` no measurement of the network at all",
    ),
  lengthMeters: z.number().int(),
  geometry: geoJsonMultiLineStringSchema,
});

const observedCellGeometrySchema = z.object({
  bearingDegrees: z.number().describe("From the site towards where the cell served, clockwise from north"),
  spreadDegrees: z.number().describe("The narrowest arc around the bearing that holds 80 % of where it served"),
  reachMeters: z.number().int().describe("The distance from the site that 95 % of where it served lies within"),
  reachByTimingAdvanceMeters: z.number().int().nullable().describe("The same distance read from timing advance: how far the cell answered phones"),
  meanRsrqDb: z.number().nullable().describe("RSRQ, or SS-RSRQ on NR"),
  meanSinrDb: z.number().nullable().describe("RS-SNR, or SS-SINR on NR"),
  levelByDistance: z
    .array(z.object({ fromMeters: z.number().int(), toMeters: z.number().int(), meanDbm: z.number(), meanSinrDb: z.number().nullable() }))
    .describe("The mean level in rings of 250 m around the site, nearest first"),
});

const nullableValueSchema = z.number().int().nullable();

const observedCellRecordShape = {
  id: z.number().int(),
  observedSiteId: z.number().int().nullable().describe("`null` until the engine places the cell on a site"),
  plmns: z.array(z.string()).describe("The network it was observed under, then the other networks it broadcasts"),
  copyOfObservedCellId: z.number().int().nullable().describe("Set on the same radio cell observed under another network"),
  operatorId: z.number().int().nullable().describe("The operator of the first network"),
  bandId: z
    .number()
    .int()
    .nullable()
    .describe(
      "The band of the matched cell, else the one band of the plan of the network's country that holds the channel. `null` when no single band does",
    ),
  bandwidthKhz: nullableValueSchema.describe("The downlink bandwidth"),
  reportedBandNumbers: z.array(z.number().int()).describe("The 3GPP band numbers the cell announces"),
  ulBandwidthKhz: nullableValueSchema.describe("LTE and NR: the uplink bandwidth, only where it differs from the downlink's"),
  supportsEndc: z.boolean().nullable().describe("LTE: whether the cell offers 5G NSA"),
  isAccessClosed: z
    .boolean()
    .nullable()
    .describe("Whether data and signalling are barred for all but emergency calls and the operator's own access classes"),
  isBarred: z.boolean().nullable().describe("Whether the cell's system information bars it"),
  isReservedForOperatorUse: z
    .boolean()
    .nullable()
    .describe("Whether the cell's system information keeps it for the operator's own use, such as testing, for at least one of its networks"),
  sampleCount: z.number().int(),
  personCount: z.number().int(),
  squareCount: z.number().int().describe("The squares phones measured it in"),
  firstSeenOn: daySchema.describe("The first day phones measured it, in UTC"),
  lastSeenOn: daySchema.describe("The latest day phones measured it, in UTC"),
  match: z
    .enum(CELL_MATCHES_FOUND)
    .nullable()
    .describe(
      "What it was matched to: a cell in the database (`cell`, or `cellByLac` for a UMTS cell found by its LAC), or only a station. `null` when nothing matched",
    ),
  networkMatch: z.enum(CELL_NETWORK_MATCHES).nullable().describe("How its network relates to the matched station, as `POST /cells/match` says it"),
  matchedCellId: z.number().int().nullable(),
  matchedStationId: z.number().int().nullable(),
  geometry: observedCellGeometrySchema
    .nullable()
    .describe("Where it served, from the squares people measured. `null` until enough people measured it around a placed site"),
  footprint: geoJsonPolygonSchema.nullable().optional().describe(`${INCLUDE_NOTE}. \`null\` when \`geometry\` is`),
  edges: z.array(observedCellEdgeSchema).optional().describe(`${INCLUDE_NOTE}. One entry per kind of edge the footprint has`),
  observedSite: observedCellSiteSchema
    .nullable()
    .optional()
    .describe(
      `${INCLUDE_NOTE}, as you may see the site in \`GET /observed/sites/{id}\`. \`null\` while the cell is on no site, and left out when you may not see its site`,
    ),
};

export const gsmObservedCellRecordSchema = z.object({
  ...observedCellRecordShape,
  rat: z.literal("gsm"),
  lac: z.number().int().describe(CELL_FIELD_NOTES.lac),
  cid: z.number().int().describe(CELL_FIELD_NOTES.cid),
  bsic: nullableValueSchema,
  arfcn: nullableValueSchema.describe("ARFCN, the channel number"),
});

export const umtsObservedCellRecordSchema = z.object({
  ...observedCellRecordShape,
  rat: z.literal("umts"),
  lac: nullableValueSchema.describe(CELL_FIELD_NOTES.lac),
  longCid: z.number().int().describe("The long cell id, equal to `rnc * 65536 + cid`"),
  rnc: z.number().int().describe(CELL_FIELD_NOTES.rnc),
  cid: z.number().int().describe(CELL_FIELD_NOTES.cid),
  psc: nullableValueSchema,
  uarfcn: nullableValueSchema.describe(CELL_FIELD_NOTES.uarfcn),
});

export const lteObservedCellRecordSchema = z.object({
  ...observedCellRecordShape,
  rat: z.literal("lte"),
  eci: z.number().int(),
  enbid: z.number().int().describe(CELL_FIELD_NOTES.enbid),
  clid: z.number().int().describe(CELL_FIELD_NOTES.clid),
  tac: nullableValueSchema.describe(CELL_FIELD_NOTES.tac),
  pci: nullableValueSchema.describe(CELL_FIELD_NOTES.pci),
  earfcn: nullableValueSchema.describe(CELL_FIELD_NOTES.earfcn),
  ulEarfcn: nullableValueSchema.describe("Only where it differs from what the band's duplex spacing implies"),
});

export const nrObservedCellRecordSchema = z.object({
  ...observedCellRecordShape,
  rat: z.literal("nr"),
  nci: z.number().int(),
  gnbid: z.number().int().describe(CELL_FIELD_NOTES.gnbid),
  clid: z.number().int().describe(CELL_FIELD_NOTES.clid),
  tac: nullableValueSchema.describe(CELL_FIELD_NOTES.tac),
  pci: nullableValueSchema.describe(CELL_FIELD_NOTES.pci),
  arfcn: nullableValueSchema.describe(CELL_FIELD_NOTES.arfcn),
  ulArfcn: nullableValueSchema.describe("Only where it differs from what the band's duplex spacing implies"),
});

export const observedCellRecordSchema = z.discriminatedUnion("rat", [
  gsmObservedCellRecordSchema,
  umtsObservedCellRecordSchema,
  lteObservedCellRecordSchema,
  nrObservedCellRecordSchema,
]);
export type ObservedCellRecord = z.infer<typeof observedCellRecordSchema>;

export const OBSERVED_SITE_INCLUDES = ["cells"] as const;
export const OBSERVED_SITE_SORTS = ["-id", "id"] as const;
const LISTED_SITE_STATUSES = ["unmatched", "suggested", "matched", "ignored"] as const satisfies readonly ObservedSiteStatus[];
const MAX_OBSERVED_INCLUDE_LIMIT = 200;
const INCLUDE_LIMIT_NOTE = `At most ${MAX_OBSERVED_INCLUDE_LIMIT} with \`include\``;
const INCLUDE_LIMIT_ISSUE = { path: ["limit"], message: `With include the limit is at most ${MAX_OBSERVED_INCLUDE_LIMIT}` };

function fitsIncludeLimit(query: { include?: readonly string[]; limit: number }): boolean {
  return query.include === undefined || query.limit <= MAX_OBSERVED_INCLUDE_LIMIT;
}

export const observedSiteSchema = observedSiteUnion({
  cells: z.array(observedCellRecordSchema).optional().describe(`${INCLUDE_NOTE}. The site's own cells, copies included`),
});
export type ObservedSite = z.infer<typeof observedSiteSchema>;

export const observedSiteParamsSchema = z.object({ id: idParamSchema });

export const observedSiteQuerySchema = z.object({ include: csvEnumSchema(OBSERVED_SITE_INCLUDES).optional() }).strict();
export type ObservedSiteQuery = z.infer<typeof observedSiteQuerySchema>;

export const observedSiteListQuerySchema = z
  .object({
    ids: csvIdsSchema.optional(),
    ...areaFilterShape,
    bbox: bboxSchema
      .optional()
      .describe(
        "Sites whose fit lies in the box, as `west,south,east,north` in degrees: a group's fit for its members, the primary's for a copy. " +
          "A snapped site is found by its fit too",
      ),
    operatorIds: csvIdsSchema
      .optional()
      .describe(
        "Sites observed under one of the operators' networks, or with a cell that broadcasts one, as two people read it. " +
          "For a shared network, its members' networks count too",
      ),
    keepOtherCountries: booleanQuerySchema
      .optional()
      .describe(`${KEEP_OTHER_COUNTRIES_LEAD}. Sites in any other country match whatever their network is. Has no effect without \`operatorIds\``),
    rats: csvEnumSchema(CELL_RATS).optional(),
    bandIds: csvBandIdsSchema.optional(),
    statuses: csvEnumSchema(LISTED_SITE_STATUSES).optional(),
    minPeople: z.coerce.number<number>().int().min(1).optional().describe("Sites whose estimate rests on at least this many people"),
    lastSeenAfter: daySchema.optional().describe("Sites with a cell phones measured on or after this day"),
    includeCopies: booleanQuerySchema.optional(),
    include: csvEnumSchema(OBSERVED_SITE_INCLUDES).optional(),
    sort: z.enum(OBSERVED_SITE_SORTS).default("-id"),
    limit: z.coerce.number<number>().int().min(1).max(MAX_LOCATION_LIST_LIMIT).default(50).describe(INCLUDE_LIMIT_NOTE),
    cursor: cursorSchema.optional(),
    includeTotal: booleanQuerySchema.optional(),
  })
  .strict()
  .refine(fitsIncludeLimit, INCLUDE_LIMIT_ISSUE);
export type ObservedSiteListQuery = z.infer<typeof observedSiteListQuerySchema>;

export const observedSiteListSchema = z.object({ data: z.array(observedSiteSchema), paging: pagingSchema });
export type ObservedSiteList = z.infer<typeof observedSiteListSchema>;

const testedPlaceShape = {
  latitude: z.number(),
  longitude: z.number(),
  difference: z.number().describe("How much worse the measurements fit this place than the fit. The grid's bytes count the same in tenths"),
  probability: z.number().describe("How likely the site stands here"),
  isSnap: z.boolean(),
};

export const observedSiteEvidenceSchema = z.object({
  observedSiteId: z.number().int().describe("The site the evidence is of: for a copy, its primary"),
  fit: z
    .object({
      ...pointSchema.shape,
      radiusMeters: z.number().int(),
      confidence: z.literal(OBSERVED_SITE_CONFIDENCE),
      ellipse: z.object({ majorMeters: z.number().int(), minorMeters: z.number().int(), azimuthDegrees: z.number().int() }),
      alternative: pointSchema.nullable().describe("A second likely point, when the readings fit two places"),
    })
    .nullable()
    .describe("The estimate before any snap: for a member of a group, the group's. `null` while the site has none"),
  grid: z
    .object({
      origin: pointSchema.describe("The south-west corner"),
      cellMeters: z.number().int().describe("The side of a grid cell, in a flat plane around the origin"),
      columns: z.number().int(),
      rows: z.number().int(),
      cost: z
        .string()
        .describe(
          "One byte per grid cell in base64, rows from south to north and each row from west to east. " +
            "A byte is how much worse the measurements fit that place than the best one, in tenths: 0 is the best place, 255 means 25.5 or more",
        ),
    })
    .nullable()
    .describe("Where the site may stand, as the site's own estimate sees it. `null` when none is kept, as for a matched site near its station"),
  timingAdvanceSquares: z
    .array(
      z.object({
        latitude: z.number(),
        longitude: z.number(),
        observedCellId: z.number().int(),
        distanceMeters: z.number().int().describe("The median of the distances the square's timing advances give, after calibration"),
        samples: z.number().int(),
      }),
    )
    .describe(
      "One entry per square and cell, at the square's center, for the cells behind the estimate. At most 5,000, those with the most samples. " +
        "Editors get only the squares that may be shown publicly, administrators all of them",
    ),
  timingAdvanceSquaresTruncated: z.boolean().describe("`true` when you would get more squares than the 5,000 listed"),
  cells: z
    .array(observedCellRecordSchema)
    .describe("The cells behind the estimate, copies left out. `timingAdvanceSquares` names them by `observedCellId`"),
  candidates: z
    .array(
      z.discriminatedUnion("kind", [
        locationSnapTargetSchema.extend({ ...testedPlaceShape, location: locationSchema.describe("With its stations") }),
        officialSiteSnapTargetSchema.extend({
          ...testedPlaceShape,
          officialSite: officialSiteRefSchema.optional().describe("Left out when its source is hidden from you"),
        }),
        observedSiteSnapTargetSchema.extend({
          ...testedPlaceShape,
          observedSite: observedCellSiteSchema.optional().describe("Left out when you may not see it"),
        }),
      ]),
    )
    .describe("Every known place the estimate was tested against. A group is tested as one, so its members get the same places"),
});
export type ObservedSiteEvidence = z.infer<typeof observedSiteEvidenceSchema>;

export const observedSiteUpdateSchema = z
  .object({
    ignore: z
      .object({ reason: z.string().trim().min(1).max(500).describe("Why the site will not become a station in the database") })
      .strict()
      .nullable()
      .optional()
      .describe("Ignores the site, in place of a link made by hand. `null` takes the ignore back"),
    handLink: z
      .object({ stationId: idSchema })
      .strict()
      .nullable()
      .optional()
      .describe("Links the site to the station by hand, in place of an ignore. `null` takes the link back"),
  })
  .strict()
  .refine(hasAnyField, AT_LEAST_ONE_FIELD_ISSUE)
  .refine((change) => change.ignore === undefined || change.handLink === undefined, {
    path: ["handLink"],
    error: "Send either `ignore` or `handLink`, not both",
  });
export type ObservedSiteUpdate = z.infer<typeof observedSiteUpdateSchema>;

const copyConflictSchema = z.object({
  kind: z.literal("copy"),
  observedSiteId: z.number().int().describe("The site it copies, which you change instead"),
});
const replacedConflictSchema = z.object({ kind: z.literal("replaced"), replacedByObservedSiteIds: z.array(z.number().int()) });
const stationSiteConflictSchema = z.object({
  kind: z.literal("stationSite"),
  stationId: z.number().int().describe("The station whose GSM and UMTS cells the site holds"),
});

export const observedSiteConflictSchema = z.discriminatedUnion("kind", [copyConflictSchema, replacedConflictSchema, stationSiteConflictSchema]);
export type ObservedSiteConflict = z.infer<typeof observedSiteConflictSchema>;

export const observedSiteStationConflictSchema = z.discriminatedUnion("kind", [
  copyConflictSchema,
  replacedConflictSchema,
  stationSiteConflictSchema,
  z.object({ kind: z.literal("madeFromSite"), stationId: z.number().int() }),
  z.object({ kind: z.literal("matched"), stationId: z.number().int() }),
]);
export type ObservedSiteStationConflict = z.infer<typeof observedSiteStationConflictSchema>;

export const observedCellParamsSchema = z.object({ id: idParamSchema });

export const observedCellQuerySchema = z.object({ include: csvEnumSchema(OBSERVED_CELL_INCLUDES).optional() }).strict();
export type ObservedCellQuery = z.infer<typeof observedCellQuerySchema>;

export const observedCellListQuerySchema = z
  .object({
    ids: csvIdsSchema.optional(),
    observedSiteIds: csvIdsSchema.optional(),
    matchedStationIds: csvIdsSchema.optional(),
    matchedCellIds: csvIdsSchema.optional(),
    plmns: csvSchema
      .pipe(z.array(plmnCodeSchema).min(1).max(100))
      .optional()
      .describe("Comma-separated network codes. A cell counts when it was observed under one of them, or broadcasts one"),
    operatorIds: csvIdsSchema.optional().describe("The same, for the operators' networks. For a shared network, its members' networks count too"),
    rats: csvEnumSchema(CELL_RATS).optional(),
    bandIds: csvBandIdsSchema.optional(),
    bbox: bboxSchema
      .optional()
      .describe("Cells whose footprint touches the box, as `west,south,east,north` in degrees. A cell without a footprint is not found this way"),
    lastSeenAfter: daySchema.optional().describe("Only cells phones measured on or after this day"),
    includeCopies: booleanQuerySchema.optional(),
    include: csvEnumSchema(OBSERVED_CELL_INCLUDES).optional(),
    limit: z.coerce
      .number<number>()
      .int()
      .min(1)
      .max(1000)
      .default(50)
      .describe(`${INCLUDE_LIMIT_NOTE}. A cell carries where it served, so a page holds fewer cells than the site list holds sites`),
    cursor: cursorSchema.optional(),
    includeTotal: booleanQuerySchema.optional(),
  })
  .strict()
  .refine(fitsIncludeLimit, INCLUDE_LIMIT_ISSUE);
export type ObservedCellListQuery = z.infer<typeof observedCellListQuerySchema>;

export const observedCellListSchema = z.object({ data: z.array(observedCellRecordSchema), paging: pagingSchema });
export type ObservedCellList = z.infer<typeof observedCellListSchema>;

export type ObservationFlagKind = (typeof OBSERVATION_FLAG_KINDS)[number];

export const OBSERVATION_FLAG_STATUSES = ["open", "resolved", "dismissed"] as const;
export type ObservationFlagStatus = (typeof OBSERVATION_FLAG_STATUSES)[number];

export const OBSERVATION_FLAG_INCLUDES = ["station", "station.location", "cell", "observedCell", "observedSite"] as const;
export type ObservationFlagInclude = (typeof OBSERVATION_FLAG_INCLUDES)[number];

export const OBSERVATION_FLAG_SORTS = ["-createdAt", "createdAt", "-updatedAt", "updatedAt", "stationId", "-stationId"] as const;
export type ObservationFlagSort = (typeof OBSERVATION_FLAG_SORTS)[number];

const MEASURED_FIELDS = ["areaCode", "pci", "channel"] as const;
const MEASURED_FIELD_NOTE = "`areaCode` is the TAC or LAC, `pci` the PCI, PSC or BSIC, and `channel` the EARFCN, ARFCN or UARFCN";

const FLAG_STATUS_NOTE =
  "`resolved` once the database agrees with what phones report, or phones stop reporting it. `dismissed` when an editor set it aside. " +
  "Their `suggestion` is `null`";
const FLAG_STATION_NOTE =
  "The station the suggestion changes, or the one the flag is about. Once an `unmatchedSite` or `positionShifts` flag is applied, the station made from its site";
const FLAG_CELL_NOTE = "The cell the suggestion changes, or the one the flag is about";
const FLAG_COUNTRY_NOTE = "The country of the flag's station, or the country the flag is about. `null` for flags about readers, devices and people";
const FLAG_RESOLVED_BY_NOTE = "Who resolved or dismissed it. `null` while it is open, and when it resolved by itself";
const FLAG_CLOSED_REASON_NOTE =
  "Why it closed: `applied` when an editor applied its suggestion with `POST /cells/apply` or `POST /observed/sites/{id}/station`, " +
  "`fixedElsewhere` when the database changed some other way and now agrees, `evidenceGone` when the measurements no longer show it, " +
  "and `dismissed` when an editor set it aside. A suggestion applied through another endpoint closes as `fixedElsewhere` at the next pass. " +
  "`null` while it is open";
const DISMISSED_REASONS_NOTE =
  "`notAnIssue` when the database is right, `cannotVerify` when nobody can tell which is right, and `needsSurvey` when someone has to look on site";

const samplesSchema = z.number().int().describe("Readings that reported it");
const peopleSchema = z.number().int();
const lastSeenOnSchema = daySchema.describe("The latest day phones reported it, in UTC");

const flagValueEvidenceSchema = z.object({
  field: z.enum(MEASURED_FIELDS).describe(MEASURED_FIELD_NOTE),
  observed: z.number().int().describe("The value phones report. When they report several, the one seen most recently"),
  stored: z.number().int().nullable().describe("The cell's value. `null` for `valueMissing`"),
  samples: samplesSchema,
  people: peopleSchema,
  lastSeenOn: lastSeenOnSchema,
});
const NETWORKS_CHANGE_NOTE = "One `update` with the cell's whole list of networks after the change, the owner's main code first";

function flagCellChangesSchema(note: string) {
  return z.object({
    cells: z.array(cellApplyChangeSchema).min(1).describe(`Items for \`cells\` in \`POST /cells/apply\` on the flag's station. ${note}`),
  });
}
const flagSiteIdsSchema = z.array(z.number().int()).describe("The site and, for a group, its other members");
const estimatePeopleSchema = z.number().int().describe("People behind the estimate");

const observationFlagBaseShape = {
  id: z.number().int(),
  status: z.enum(OBSERVATION_FLAG_STATUSES).describe(FLAG_STATUS_NOTE),
  closedReason: z.enum(OBSERVATION_FLAG_CLOSED_REASONS).nullable().describe(FLAG_CLOSED_REASON_NOTE),
  dismissedReason: z
    .enum(OBSERVATION_FLAG_DISMISSED_REASONS)
    .nullable()
    .describe(`Why the editor set it aside: ${DISMISSED_REASONS_NOTE}. \`null\` unless \`status\` is \`dismissed\``),
  observedSiteId: z.number().int().nullable(),
  observedCellId: z.number().int().nullable(),
  stationId: z.number().int().nullable().describe(FLAG_STATION_NOTE),
  cellId: z.number().int().nullable().describe(FLAG_CELL_NOTE),
  sectorId: z.number().int().nullable().describe("The sector a `bearingDiffers` flag is about"),
  bandId: z.number().int().nullable().describe("The band a `bandNotInPlan` flag is about"),
  deviceId: z.uuid().nullable().describe("The device a `deviceRevoked` flag is about"),
  userId: z.uuid().nullable().describe("The person an `untrustedContributor` flag is about, whose profile its `evidence.user` carries"),
  countryCode: z.string().nullable().describe(FLAG_COUNTRY_NOTE),
  regionId: z.number().int().nullable().describe("The region of the flag's station, or where its site is shown"),
  note: z
    .string()
    .nullable()
    .describe("What the editor wrote when dismissing it. `null` unless `status` is `dismissed`, and when they wrote nothing"),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime().describe("When its evidence, suggestion or status last changed"),
  resolvedAt: z.iso.datetime().nullable().describe("When it was resolved or dismissed"),
  resolvedBy: userRefSchema.nullable().describe(FLAG_RESOLVED_BY_NOTE),
};
const observationFlagIncludeShape = {
  station: stationSchema.nullable().optional().describe(`${INCLUDE_NOTE}. With \`station.location\` it carries its \`location\``),
  cell: cellSchema.nullable().optional().describe(INCLUDE_NOTE),
  observedCell: observedCellRecordSchema.nullable().optional().describe(INCLUDE_NOTE),
  observedSite: observedCellSiteSchema
    .nullable()
    .optional()
    .describe(`${INCLUDE_NOTE}. \`null\` when the flag names no site, and left out when you may not see the site`),
};

function flagOf<const Kind extends ObservationFlagKind, Evidence extends z.ZodType, Suggestion extends z.ZodType>(
  kind: Kind,
  evidence: Evidence,
  suggestion: Suggestion,
) {
  return z.object({
    ...observationFlagBaseShape,
    kind: z.literal(kind),
    evidence,
    suggestion: suggestion.nullable(),
    ...observationFlagIncludeShape,
  });
}

export const observationFlagSchema = z.discriminatedUnion("kind", [
  flagOf(
    "cellMissing",
    z.object({ samples: samplesSchema, people: peopleSchema, lastSeenOn: lastSeenOnSchema }),
    flagCellChangesSchema("One `create` with the cell phones measured"),
  ),
  flagOf("valueDiffers", flagValueEvidenceSchema, flagCellChangesSchema("One `update` with the cell's field and its new value")),
  flagOf("valueMissing", flagValueEvidenceSchema, flagCellChangesSchema("One `update` with the cell's field and its value")),
  flagOf(
    "networkMissing",
    z.object({
      network: z.string().describe("The network code phones saw"),
      seenAs: z
        .enum(["list", "missingCode"])
        .describe("`list` when it was in the list of networks read from the cell, `missingCode` when phones saw the cell under it"),
      samples: samplesSchema,
      people: peopleSchema,
      lastSeenOn: lastSeenOnSchema,
    }),
    flagCellChangesSchema(NETWORKS_CHANGE_NOTE),
  ),
  flagOf(
    "networkNotSeen",
    z.object({
      network: z.string().describe("The network the cell lists"),
      readingsWithList: z.number().int().describe("Readings of the cell that read its list of networks"),
      people: z.number().int().describe("People who read its list"),
      lastListedOn: daySchema.nullable().describe("The latest day a list read from the cell named the network, in UTC. `null` if none did"),
    }),
    flagCellChangesSchema(NETWORKS_CHANGE_NOTE),
  ),
  flagOf(
    "bandNotInPlan",
    z.object({
      rat: z.enum(CELL_RATS),
      channels: z.array(z.number().int()).describe("The channels phones saw in the band"),
      samples: samplesSchema,
      people: peopleSchema,
      lastSeenOn: lastSeenOnSchema,
    }),
    z.object({ bandId: z.number().int().describe("The band to add to the country's plan") }),
  ),
  flagOf(
    "readerQuirk",
    z.object({
      field: z.enum(MEASURED_FIELDS).describe(MEASURED_FIELD_NOTE),
      pattern: z
        .enum(VALUE_PATTERNS)
        .describe(
          "How the phones' values differ from the database's: `bytesSwapped` has its bytes reversed, `factor` is it times `parameter`, " +
            "or divided by minus `parameter` when that is negative, `offset` is it plus `parameter`, and `constant` is `parameter` whatever the value",
        ),
      parameter: z.number().int().nullable().describe("`null` for `bytesSwapped`"),
      deviceModel: deviceModelRefSchema.nullable().describe("`null` when the flag is about a reader version"),
      readerVersion: readerVersionSchema.nullable().describe("`null` when the flag is about a device model"),
      valueCount: z.number().int().describe("Values that differ this way"),
      cellCount: z.number().int().describe("Cells they were read from, counted once per upload"),
      uploadCount: z.number().int(),
    }),
    z.object({
      readingBlock: measurementReadingBlockSchema
        .pick({ phones: true, mode: true })
        .extend({ fields: z.array(z.enum(READING_BLOCK_FIELDS)).min(1) })
        .describe("A body for `POST /measurements/reading-blocks` once you add a `reason`"),
    }),
  ),
  flagOf(
    "deviceRevoked",
    z.object({
      serial: z.string().describe("The serial of the device's first listed certificate, in lower-case hexadecimal as the revocation list writes it"),
      revocationStatus: z.enum(["revoked", "suspended"]),
    }),
    z.null(),
  ),
  flagOf(
    "untrustedContributor",
    z.object({
      user: userRefSchema,
      agreement: z.number().describe("The share of the person's timing advances on confirmed stations that agree with the stations, from 0 to 1"),
      everyoneAgreement: z.number().describe("The same share over everyone's devices. The flag opens below 0.7 times it"),
      readings: z.number().int().describe("Readings on confirmed stations"),
    }),
    z.null(),
  ),
  flagOf(
    "unmatchedSite",
    z.object({
      observedSiteIds: flagSiteIdsSchema,
      people: estimatePeopleSchema,
      radiusMeters: z.number().int().nullable().describe("The fit's radius. `null` when the site snapped to a known place"),
    }),
    stationCreateSchema.describe(
      "A body for `POST /observed/sites/{id}/station`. Each cell whose observed cell has a `geometry` hangs on a sector at its `bearingDegrees`, " +
        "rounded to the degree, up to the 15 bearings with the most cells",
    ),
  ),
  flagOf(
    "positionShifts",
    z.object({
      observedSiteIds: flagSiteIdsSchema,
      people: estimatePeopleSchema,
      shiftMeters: z.number().int().describe("How far the estimate moves when the readings from one direction are left out"),
      radiusMeters: z.number().int(),
    }),
    z.null(),
  ),
  flagOf(
    "suggestedSite",
    z.object({ distanceMeters: z.number().int().describe("From where the site is shown to the station"), people: estimatePeopleSchema }),
    flagCellChangesSchema("A `create` for each confirmed cell of the site"),
  ),
  flagOf(
    "positionDiffers",
    z.object({ distanceMeters: z.number().int().describe("From the site's fit to the station"), radiusMeters: z.number().int() }),
    z.null(),
  ),
  flagOf(
    "renumbered",
    z.object({
      previousObservedSiteId: z.number().int().describe("The site that went quiet, whose cells are the station's"),
      alikeCellCount: z.number().int().describe("The station's cells whose channel and PCI a cell of the new site has"),
    }),
    flagCellChangesSchema("An `update` for each of those cells with its new `enbid` or `gnbid`, and its `clid` where that changed too"),
  ),
  flagOf(
    "bearingDiffers",
    z.object({
      bearingDegrees: z.number().describe("Where the cell served, clockwise from north"),
      spreadDegrees: z.number(),
      azimuth: z.number().int().describe("The sector's azimuth in the database"),
    }),
    z.null(),
  ),
  flagOf(
    "possiblyDecommissioned",
    z.object({
      lastSeenOn: daySchema.nullable().describe("The latest day phones measured the cell, in UTC. `null` if they never did"),
      networkMeasuredOn: daySchema.describe("The latest day phones measured its network and band where it served, in UTC"),
      measuredSquareCount: z
        .number()
        .int()
        .describe("Map tiles of zoom 18 inside where it served in which phones measured its network and band in the last 30 days"),
    }),
    z.null(),
  ),
  flagOf(
    "nodeSpansPlaces",
    z.object({
      places: z
        .array(z.object({ latitude: z.number(), longitude: z.number(), observedCellIds: z.array(z.number().int()) }))
        .describe("Where the site's cells served, grouped by place. One place means their timing advances disagree with it"),
    }),
    z.null(),
  ),
  flagOf(
    "gnbLengthSuggestion",
    z.object({
      plmn: z.string(),
      length: z.number().int().describe("The gNBID length the network's cells are cut with"),
      suggestedLength: z.number().int(),
      siteCount: z.number().int().describe("How many gNBIDs the cells split into at the length they are cut with"),
    }),
    z.null(),
  ),
  flagOf(
    "siteIdKnown",
    z.object({
      officialSiteId: z.number().int().describe("The register site that gives the number"),
      enbid: z.number().int().describe("The eNBID the register site is found by"),
    }),
    z.object({ siteId: z.string().describe("The number, for `station.siteId` in `PATCH /stations/{id}`") }),
  ),
]);
export type ObservationFlag = z.infer<typeof observationFlagSchema>;

const FLAG_STATUSES_NOTE = `Open flags when left out. Comma-separated list. Possible values: \`${OBSERVATION_FLAG_STATUSES.join("`, `")}\``;

export const observationFlagListQuerySchema = z
  .object({
    kinds: csvEnumSchema(OBSERVATION_FLAG_KINDS).optional(),
    statuses: csvEnumSchema(OBSERVATION_FLAG_STATUSES).optional().describe(FLAG_STATUSES_NOTE),
    countryCodes: csvCountryCodesSchema.optional(),
    regionIds: csvIdsSchema.optional(),
    stationIds: csvIdsSchema.optional(),
    station: searchTextSchema
      .optional()
      .describe("Flags about the stations this text finds by site id, identifier, cell id, city or address, like the free text of `GET /search`"),
    cellIds: csvIdsSchema.optional(),
    observedSiteIds: csvIdsSchema.optional().describe("Comma-separated ids. A flag about a whole group, such as `unmatchedSite`, names its lead"),
    operatorIds: csvIdsSchema
      .optional()
      .describe(
        "Flags about the operators' stations, matched as `GET /stations` matches them, and about sites, cells and networks observed under their networks. " +
          "For a shared network, its members' networks count too",
      ),
    updatedAfter: instantSchema.optional().describe("Only flags whose evidence, suggestion or status changed at or after this time"),
    include: csvEnumSchema(OBSERVATION_FLAG_INCLUDES).optional(),
    sort: z
      .enum(OBSERVATION_FLAG_SORTS)
      .default("-createdAt")
      .describe("`stationId` lists each station's flags together, the newest first, and the flags about no station last"),
    limit: limitSchema,
    cursor: cursorSchema.optional(),
    includeTotal: booleanQuerySchema.optional(),
    includeCounts: booleanQuerySchema.optional(),
  })
  .strict();
export type ObservationFlagListQuery = z.infer<typeof observationFlagListQuerySchema>;

export const observationFlagCountsSchema = z
  .object({
    kinds: z.partialRecord(z.enum(OBSERVATION_FLAG_KINDS), z.number().int().positive()),
    statuses: z.partialRecord(z.enum(OBSERVATION_FLAG_STATUSES), z.number().int().positive()),
  })
  .describe(
    "Only returned with `includeCounts=true`. The flags per kind and per status that your other filters match: " +
      "`kinds` counts as if you sent no `kinds`, and `statuses` as if you sent every status. A kind or status without flags is left out",
  );
export type ObservationFlagCounts = z.infer<typeof observationFlagCountsSchema>;

export const observationFlagListSchema = z.object({
  data: z.array(observationFlagSchema),
  paging: pagingSchema,
  counts: observationFlagCountsSchema.optional(),
});
export type ObservationFlagList = z.infer<typeof observationFlagListSchema>;

export const observationFlagParamsSchema = z.object({ id: idParamSchema });

export const observationFlagQuerySchema = z.object({ include: csvEnumSchema(OBSERVATION_FLAG_INCLUDES).optional() }).strict();
export type ObservationFlagQuery = z.infer<typeof observationFlagQuerySchema>;

export const observationFlagUpdateSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("dismissed"),
      dismissedReason: z.enum(OBSERVATION_FLAG_DISMISSED_REASONS).describe(`Why you set it aside: ${DISMISSED_REASONS_NOTE}`),
      note: z.string().trim().min(1).max(500).optional().describe("Anything you want to add for the next editor"),
    })
    .strict(),
  z.object({ status: z.literal("open") }).strict(),
]);
export type ObservationFlagUpdate = z.infer<typeof observationFlagUpdateSchema>;

export const observationFlagConflictSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("resolved") }),
  z.object({ kind: z.literal("openFlag"), observationFlagId: z.number().int().describe("The open flag of the same kind and subject") }),
]);
export type ObservationFlagConflict = z.infer<typeof observationFlagConflictSchema>;
