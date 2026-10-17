import { z } from "zod/v4";

import { TERRAIN_RECEIVER_HEIGHT_M } from "../terrainProfile.ts";
import { MAX_LATITUDE, MAX_LONGITUDE, csvEnumSchema, idSchema } from "./common.ts";
import { emfReportHeadSchema } from "./emf.ts";

export const TERRAIN_PROFILE_STATUSES = ["pending", "ready", "failed", "cancelled"] as const;
export type TerrainProfileStatus = (typeof TERRAIN_PROFILE_STATUSES)[number];

export const TERRAIN_PROFILE_INCLUDES = ["candidates", "propagation"] as const;
export type TerrainProfileInclude = (typeof TERRAIN_PROFILE_INCLUDES)[number];

export const TERRAIN_VERDICTS = ["clear", "blocked"] as const;
export type TerrainVerdict = (typeof TERRAIN_VERDICTS)[number];

export const SURFACE_VERDICTS = ["clear", "blocked", "unknown"] as const;
export type SurfaceVerdict = (typeof SURFACE_VERDICTS)[number];

export const TERRAIN_ANTENNA_SOURCES = ["emfReport", "permit"] as const;
export type TerrainAntennaSource = (typeof TERRAIN_ANTENNA_SOURCES)[number];

export const TERRAIN_ANTENNA_TECHNOLOGIES = ["gsm", "cdma", "umts", "lte", "nr", "iot"] as const;

export const TERRAIN_TILT_SOURCES = ["measured", "declared"] as const;
export type TerrainTiltSource = (typeof TERRAIN_TILT_SOURCES)[number];

export const TERRAIN_FAILURE_REASONS = ["antennaDataUnavailable", "antennaNotFound", "elevationDataUnavailable", "internalError"] as const;
export type TerrainFailureReason = (typeof TERRAIN_FAILURE_REASONS)[number];

export const TERRAIN_WARNINGS = [
  "emfReportUnavailable",
  "emfReportUnreadable",
  "antennaFromPermit",
  "antennaFromSharedNetwork",
  "outsideMainBeam",
  "surfaceDataUnavailable",
  "surfaceDataIncomplete",
  "terrainDataIncomplete",
  "elevationDataStale",
] as const;
export type TerrainWarning = (typeof TERRAIN_WARNINGS)[number];

export const TERRAIN_PATH_TYPES = ["lineOfSight", "transHorizon"] as const;
export type TerrainPathType = (typeof TERRAIN_PATH_TYPES)[number];

const terrainReceiverSchema = z.object({
  latitude: z.number().min(-MAX_LATITUDE).max(MAX_LATITUDE),
  longitude: z.number().min(-MAX_LONGITUDE).max(MAX_LONGITUDE),
  heightMeters: z.number().min(TERRAIN_RECEIVER_HEIGHT_M.min).max(TERRAIN_RECEIVER_HEIGHT_M.max).describe("Height above the ground"),
});

const terrainAntennaShape = {
  key: z.string().describe("Stays the same for the same antenna, even after a newer report is published"),
  source: z.enum(TERRAIN_ANTENNA_SOURCES).describe("`emfReport` for the station's newest laboratory report, `permit` for its permits"),
  heightMeters: z.number().describe("Height above the ground"),
  azimuth: z.number().nullable().describe("In degrees from north. `360` means an omnidirectional antenna"),
  tilt: z.number().nullable().describe("In degrees"),
  tiltSource: z.enum(TERRAIN_TILT_SOURCES).nullable().describe("`measured` for the report, `declared` for the permit"),
  frequencyMhz: z.number(),
  technology: z.enum(TERRAIN_ANTENNA_TECHNOLOGIES).nullable(),
  labelMhz: z.number().int().nullable().describe("The nominal frequency of the band"),
};

export const terrainAntennaSchema = z.object(terrainAntennaShape);
export type TerrainAntenna = z.infer<typeof terrainAntennaSchema>;

export const terrainSelectedAntennaSchema = z.object({
  ...terrainAntennaShape,
  isAutoSelected: z.boolean().describe("`true` if no `antennaKey` was sent and the antenna pointing closest to the receiver was selected"),
});
export type TerrainSelectedAntenna = z.infer<typeof terrainSelectedAntennaSchema>;

const SIGHT_LINE_NOTE =
  "Height above sea level of the line between the two antennas, lowered to account for the Earth's curvature. " +
  "Subtract `groundMeters` or `surfaceMeters` from it to get the clearance";

export const terrainSampleSchema = z.object({
  distanceMeters: z.number().describe("Distance from the station along the path"),
  latitude: z.number(),
  longitude: z.number(),
  groundMeters: z.number().describe("Height of the ground above sea level"),
  surfaceMeters: z.number().nullable().describe("Height of the surface above sea level, including buildings and trees"),
  sightLineMeters: z.number().describe(SIGHT_LINE_NOTE),
});
export type TerrainSample = z.infer<typeof terrainSampleSchema>;

export const terrainResultSchema = z.object({
  terrainVerdict: z.enum(TERRAIN_VERDICTS).describe("Whether the bare ground blocks the line between the antennas"),
  surfaceVerdict: z
    .enum(SURFACE_VERDICTS)
    .describe(
      "Whether the ground with its buildings and trees blocks the line between the antennas. Also `blocked` when the receiver lies beyond " +
        "the radio horizon, and `unknown` if the heights of buildings and trees are not available",
    ),
  distanceMeters: z.number(),
  bearing: z.number().describe("Direction from the station to the receiver, in degrees from north"),
  pathLossDb: z.number().describe("Basic transmission loss along the path, from the ITU-R P.1812 model"),
  referenceFieldStrengthDbuvm: z.number().describe("Field strength at the receiver for a 1 kW transmitter, not for the station's actual power"),
  beamOffset: z.object({
    azimuth: z.number().nullable().describe("Angle in degrees between the antenna's azimuth and `bearing`"),
    elevation: z
      .number()
      .nullable()
      .describe("Angle in degrees by which the receiver lies above the antenna's beam. `null` unless the tilt was measured"),
  }),
  obstacleDistanceMeters: z
    .number()
    .nullable()
    .describe("Distance from the station to the point where the path is most obstructed, or `null` if the path is unobstructed"),
  samples: z.array(terrainSampleSchema).describe("Ordered from the station to the receiver"),
  elevationData: z.object({
    source: z.string(),
    resolutionMeters: z.number().describe("Distance between two samples"),
  }),
  warnings: z
    .array(z.enum(TERRAIN_WARNINGS))
    .describe(
      "Reasons to treat the result with caution. `antennaFromPermit`: the antenna comes from a permit because no report could be read. " +
        "`antennaFromSharedNetwork`: it comes from the station of a network-sharing partner at the same location. " +
        "`outsideMainBeam`: the receiver is more than 60 degrees off the antenna's azimuth",
    ),
});
export type TerrainResult = z.infer<typeof terrainResultSchema>;

export const terrainPropagationSchema = z.object({
  pathType: z.enum(TERRAIN_PATH_TYPES).describe("`transHorizon` if the receiver lies beyond the radio horizon"),
  basicTransmissionLossDb: z.number().describe("The same value as `result.pathLossDb`, not rounded"),
  freeSpaceLossDb: z.number(),
  diffractionLossDb: z.number(),
  troposcatterLossDb: z.number(),
  anomalousLossDb: z.number().describe("The loss of anomalous propagation, that is ducting and layer reflection"),
  referenceFieldStrengthDbuvm: z.number().describe("Field strength at the receiver for a 1 kW transmitter, not for the station's actual power"),
  transmitterHorizonDistanceMeters: z.number(),
  receiverHorizonDistanceMeters: z.number(),
  effectiveEarthRadiusMeters: z.number().describe("Larger than the real radius, to account for radio waves bending in the atmosphere"),
  beta0: z
    .number()
    .describe("The model's `beta0` parameter: the percentage of time in which the lower atmosphere bends radio waves unusually strongly"),
  seaFraction: z.number().describe("The share of the path that runs over sea, from 0 to 1"),
  obstacleDistanceMeters: z
    .number()
    .nullable()
    .describe("Distance from the station to the point where the path is most obstructed, or `null` if the path is unobstructed"),
});
export type TerrainPropagation = z.infer<typeof terrainPropagationSchema>;

export const terrainProfileSchema = z.object({
  id: z.uuid(),
  status: z.enum(TERRAIN_PROFILE_STATUSES).describe("`pending` while the analysis is running, then `ready`, `failed` or `cancelled`"),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime().describe("When the profile is deleted, an hour after its last change"),
  stationId: z.number().int().nullable().describe("`null` if the profile was requested for an official site"),
  officialSiteId: z.number().int().nullable().describe("`null` if the profile was requested for a station"),
  receiver: terrainReceiverSchema,
  antenna: terrainSelectedAntennaSchema.nullable().describe("`null` unless the status is `ready`"),
  report: emfReportHeadSchema.nullable().describe("The laboratory report the antennas were read from"),
  result: terrainResultSchema.nullable().describe("`null` unless the status is `ready`"),
  failure: z
    .object({ reason: z.enum(TERRAIN_FAILURE_REASONS), message: z.string() })
    .nullable()
    .describe("`null` unless the status is `failed`"),
  candidates: z
    .array(terrainAntennaSchema)
    .optional()
    .describe("Only returned with `include=candidates`. Every antenna of the station that could be used"),
  propagation: terrainPropagationSchema
    .nullable()
    .optional()
    .describe("Only returned with `include=propagation`. The full output of the ITU-R P.1812 model"),
});
export type TerrainProfile = z.infer<typeof terrainProfileSchema>;

export const terrainProfileParamsSchema = z.object({ id: z.uuid() });

export const terrainProfileQuerySchema = z.object({ include: csvEnumSchema(TERRAIN_PROFILE_INCLUDES).optional() }).strict();
export type TerrainProfileQuery = z.infer<typeof terrainProfileQuerySchema>;

export const terrainProfileCreateSchema = z
  .object({
    stationId: idSchema.optional(),
    officialSiteId: idSchema.optional(),
    receiver: terrainReceiverSchema
      .strict()
      .describe(
        "Where the signal is received. Must be inside the `capabilities.terrainProfiles.receiverBounds` of the station's country, " +
          "at least 10 m from the station and no farther than the server allows, 30 km by default",
      ),
    antennaKey: z.string().min(1).max(64).optional().describe("If omitted, the antenna pointing closest to the receiver is selected"),
  })
  .strict()
  .refine((body) => (body.stationId === undefined) !== (body.officialSiteId === undefined), {
    message: "Send either stationId or officialSiteId",
  });
export type TerrainProfileCreate = z.infer<typeof terrainProfileCreateSchema>;
