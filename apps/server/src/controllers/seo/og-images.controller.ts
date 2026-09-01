import { locations, operators, stations } from "@openbts/drizzle";
import { getOperatorColor } from "@openbts/shared/operatorUtils";
import { parseSEOEntityId } from "@openbts/shared/seo";
import { and, asc, eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";

import db from "../../database/psql.js";
import { ErrorResponse } from "../../errors.js";
import type { FastifyZodInstance } from "../../interfaces/fastify.interface.js";
import { requestOGImage } from "../../services/ogImages/client.js";
import type { OGRenderRequest, OGRenderResult } from "../../services/ogImages/contract.js";

const IMAGE_FILE_PATTERN = /^([1-9]\d*)\.png$/;
const MAX_LOCATION_COLORS = 32;

type ImageResource = "locations" | "stations";
type ImageRequestLoader = (id: number) => Promise<OGRenderRequest | null>;
type ImageRenderer = (request: OGRenderRequest, signal?: AbortSignal) => Promise<OGRenderResult>;

type OGImagesControllerDependencies = {
  loadLocationRequest: ImageRequestLoader;
  loadStationRequest: ImageRequestLoader;
  renderImage: ImageRenderer;
};

async function loadStationRequest(id: number): Promise<OGRenderRequest | null> {
  const [station] = await db
    .select({ latitude: locations.latitude, longitude: locations.longitude, mnc: operators.mnc })
    .from(stations)
    .innerJoin(operators, eq(stations.operator_id, operators.id))
    .innerJoin(locations, eq(stations.location_id, locations.id))
    .where(eq(stations.id, id))
    .limit(1);

  if (!station) return null;

  return {
    version: 1,
    kind: "station",
    id,
    latitude: station.latitude,
    longitude: station.longitude,
    colors: [getOperatorColor(station.mnc ?? -1)],
  };
}

async function loadLocationRequest(id: number): Promise<OGRenderRequest | null> {
  const [[location], operatorRows] = await Promise.all([
    db.select({ latitude: locations.latitude, longitude: locations.longitude }).from(locations).where(eq(locations.id, id)).limit(1),
    db
      .selectDistinct({ mnc: operators.mnc })
      .from(stations)
      .innerJoin(operators, eq(stations.operator_id, operators.id))
      .where(and(eq(stations.location_id, id), eq(stations.status, "published")))
      .orderBy(asc(operators.mnc))
      .limit(MAX_LOCATION_COLORS),
  ]);

  if (!location) return null;

  return {
    version: 1,
    kind: "location",
    id,
    latitude: location.latitude,
    longitude: location.longitude,
    colors: operatorRows.map((row) => getOperatorColor(row.mnc ?? -1)),
  };
}

const defaultDependencies: OGImagesControllerDependencies = {
  loadLocationRequest,
  loadStationRequest,
  renderImage: requestOGImage,
};

function parseImageRequest(resource: string, file: string): { id: number; resource: ImageResource } | null {
  if (resource !== "stations" && resource !== "locations") return null;

  const rawId = IMAGE_FILE_PATTERN.exec(file)?.[1];
  if (!rawId) return null;

  const id = parseSEOEntityId(rawId);
  return id === null ? null : { id, resource };
}

function createRequestAbortSignal(req: FastifyRequest, res: FastifyReply): { cleanup: () => void; signal: AbortSignal } {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const abortIfOpen = () => {
    if (!res.raw.writableEnded) abort();
  };

  if (req.raw.aborted || res.raw.destroyed) abort();
  else {
    req.raw.once("aborted", abort);
    res.raw.once("close", abortIfOpen);
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      req.raw.removeListener("aborted", abort);
      res.raw.removeListener("close", abortIfOpen);
    },
  };
}

function createImageHandler(dependencies: OGImagesControllerDependencies) {
  return async (req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> => {
    const { file, resource } = req.params as { file: string; resource: string };
    const imageRequest = parseImageRequest(resource, file);
    if (!imageRequest) throw new ErrorResponse("NOT_FOUND");

    const loadRequest = imageRequest.resource === "stations" ? dependencies.loadStationRequest : dependencies.loadLocationRequest;
    const renderRequest = await loadRequest(imageRequest.id);
    if (!renderRequest) throw new ErrorResponse("NOT_FOUND");

    const { cleanup, signal } = createRequestAbortSignal(req, res);
    let image: OGRenderResult;
    try {
      image = await dependencies.renderImage(renderRequest, signal);
    } catch (error) {
      res.header("Cache-Control", "no-store");
      res.header("Retry-After", "5");
      throw new ErrorResponse("SERVICE_UNAVAILABLE", { cause: error });
    } finally {
      cleanup();
    }

    res.header("Content-Type", "image/png");
    res.header("Cache-Control", image.maxAgeSeconds > 0 ? `public, max-age=${image.maxAgeSeconds}` : "no-store");
    return res.send(image.buffer);
  };
}

export function createOGImagesController(overrides: Partial<OGImagesControllerDependencies> = {}): (fastify: FastifyZodInstance) => Promise<void> {
  const handleImage = createImageHandler({ ...defaultDependencies, ...overrides });
  return async (fastify: FastifyZodInstance): Promise<void> => {
    fastify.get("/public/og/:resource/:file", { config: { allowGuestAccess: true } }, handleImage);
  };
}

export const OGImagesController = createOGImagesController();
