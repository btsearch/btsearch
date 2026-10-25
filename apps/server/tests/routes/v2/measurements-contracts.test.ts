import type { SwaggerTransform, SwaggerTransformObject } from "@fastify/swagger";
import type { RouteOptions } from "fastify";
import { describe, expect, it } from "vitest";

import { buildSwaggerOptions, findDocumentationGap } from "../../../src/features/openapi/document.js";
import { planErrorResponses } from "../../../src/features/openapi/errorResponses.js";
import { securityFor } from "../../../src/features/openapi/security.js";
import type { RouteCaller } from "../../../src/plugins/auth/appClient.js";
import getMeasurementConfig from "../../../src/routes/v2/(get)/measurements/config.js";
import getMeasurementContributor from "../../../src/routes/v2/(get)/measurements/contributors/[userId].js";
import getMeasurementContributors from "../../../src/routes/v2/(get)/measurements/contributors/index.js";
import getMeasurementDeviceModels from "../../../src/routes/v2/(get)/measurements/device-models.js";
import getMeasurementDevice from "../../../src/routes/v2/(get)/measurements/devices/[id].js";
import getMeasurementDevices from "../../../src/routes/v2/(get)/measurements/devices/index.js";
import getMeasurementListing from "../../../src/routes/v2/(get)/measurements/listing.js";
import getMeasurementQuirkRules from "../../../src/routes/v2/(get)/measurements/quirk-rules.js";
import getMeasurementReaderVersions from "../../../src/routes/v2/(get)/measurements/reader-versions.js";
import getMeasurementReadingBlocks from "../../../src/routes/v2/(get)/measurements/reading-blocks.js";
import getMeasurementSocs from "../../../src/routes/v2/(get)/measurements/socs.js";
import getMeasurementSummary from "../../../src/routes/v2/(get)/measurements/summary.js";
import getMeasurementTerms from "../../../src/routes/v2/(get)/measurements/terms.js";
import getMeasurementUpload from "../../../src/routes/v2/(get)/measurements/uploads/[id].js";
import getMeasurementUploadFile from "../../../src/routes/v2/(get)/measurements/uploads/[id]/file.js";
import getMeasurementUploads from "../../../src/routes/v2/(get)/measurements/uploads/index.js";
import getObservedCell from "../../../src/routes/v2/(get)/observed/cells/[id].js";
import getObservedCells from "../../../src/routes/v2/(get)/observed/cells/index.js";
import getObservationEngine from "../../../src/routes/v2/(get)/observed/engine.js";
import getObservationEngineRun from "../../../src/routes/v2/(get)/observed/engine/runs/[id].js";
import getObservationEvaluation from "../../../src/routes/v2/(get)/observed/evaluations/[id].js";
import getObservationEvaluations from "../../../src/routes/v2/(get)/observed/evaluations/index.js";
import getObservedSite from "../../../src/routes/v2/(get)/observed/sites/[id].js";
import getObservedSites from "../../../src/routes/v2/(get)/observed/sites/index.js";
import getMyObservedSites from "../../../src/routes/v2/(get)/observed/sites/mine.js";
import getStaffObservedSites from "../../../src/routes/v2/(get)/observed/sites/staff.js";
import updateMeasurementContributor from "../../../src/routes/v2/(patch)/measurements/contributors/[userId].js";
import updateMeasurementDevice from "../../../src/routes/v2/(patch)/measurements/devices/[id].js";
import updateMeasurementQuirkRule from "../../../src/routes/v2/(patch)/measurements/quirk-rules/[id].js";
import updateMeasurementReadingBlock from "../../../src/routes/v2/(patch)/measurements/reading-blocks/[id].js";
import updateMeasurementUpload from "../../../src/routes/v2/(patch)/measurements/uploads/[id].js";
import updateObservedSite from "../../../src/routes/v2/(patch)/observed/sites/[id].js";
import createDeviceChallenge from "../../../src/routes/v2/(post)/measurements/device-challenges.js";
import registerMeasurementDevice from "../../../src/routes/v2/(post)/measurements/devices/index.js";
import createMeasurementReadingBlock from "../../../src/routes/v2/(post)/measurements/reading-blocks.js";
import excludeMeasurementUploads from "../../../src/routes/v2/(post)/measurements/uploads/exclusions.js";
import withdrawMeasurementUploads from "../../../src/routes/v2/(post)/measurements/uploads/withdrawals.js";
import startObservationEngineRun from "../../../src/routes/v2/(post)/observed/engine/runs.js";
import createStationFromSite from "../../../src/routes/v2/(post)/observed/sites/[id]/station.js";
import putMeasurementListing from "../../../src/routes/v2/(put)/measurements/listing.js";
import acceptMeasurementTerms from "../../../src/routes/v2/(put)/measurements/terms.js";
import putMeasurementUpload from "../../../src/routes/v2/(put)/measurements/uploads/[id].js";

const ROUTES = [
  getMeasurementConfig,
  getMeasurementTerms,
  acceptMeasurementTerms,
  createDeviceChallenge,
  registerMeasurementDevice,
  getMeasurementDevices,
  getMeasurementDevice,
  updateMeasurementDevice,
  putMeasurementUpload,
  getMeasurementUploads,
  getMeasurementUpload,
  getMeasurementUploadFile,
  updateMeasurementUpload,
  withdrawMeasurementUploads,
  excludeMeasurementUploads,
  getMeasurementReadingBlocks,
  createMeasurementReadingBlock,
  updateMeasurementReadingBlock,
  getMeasurementSummary,
  getMeasurementListing,
  putMeasurementListing,
  getMeasurementContributors,
  getMeasurementContributor,
  updateMeasurementContributor,
  getMeasurementReaderVersions,
  getMeasurementSocs,
  getMeasurementDeviceModels,
  getMeasurementQuirkRules,
  updateMeasurementQuirkRule,
  getObservationEngine,
  getObservationEngineRun,
  startObservationEngineRun,
  getObservationEvaluations,
  getObservationEvaluation,
  getObservedCells,
  getObservedCell,
  getObservedSites,
  getMyObservedSites,
  getStaffObservedSites,
  getObservedSite,
  updateObservedSite,
  createStationFromSite,
];

function tagOf({ url, config }: (typeof ROUTES)[number]): string {
  if (url.startsWith("/observed/engine") || url.startsWith("/observed/evaluations")) return "observation-engine";
  if (url.startsWith("/observed")) return "observed";
  return config?.permissions?.includes("manage:observations") ? "measurement-administration" : "measurements";
}

describe("v2 measurement routes", () => {
  it.each(ROUTES)("$method $url can be documented", (route) => {
    expect(findDocumentationGap(route as unknown as RouteOptions)).toBeUndefined();
  });

  it.each(ROUTES)("$method $url converts to the API document under its tag", (route) => {
    const options = buildSwaggerOptions("/api/v2");
    const transform = options.transform as SwaggerTransform;
    const url = `/api/v2${route.url}`;
    const { schema } = transform({
      schema: route.schema ?? {},
      url,
      route: { ...route, url } as unknown as RouteOptions,
      openapiObject: options.openapi ?? {},
    } as unknown as Parameters<SwaggerTransform>[0]);

    expect(schema).toMatchObject({ tags: [tagOf(route)] });
  });

  it.each<[RouteCaller[], object[]]>([
    [["app"], [{ app: ["upload:observations"] }]],
    [
      ["app", "session"],
      [{ app: ["upload:observations"] }, { session: ["upload:observations"] }],
    ],
  ])("documents the callers %j as their security schemes", (callers, schemes) => {
    expect(securityFor({ permissions: ["upload:observations"], callers })).toEqual(schemes);
  });

  it("puts who may call a route before its own reason for a 403", () => {
    const plan = planErrorResponses(acceptMeasurementTerms as unknown as RouteOptions, acceptMeasurementTerms.config ?? {});
    expect(plan[403]).toBe(
      "Only the BTSearch app or a browser session can call this. API keys and other applications are refused. Also returned while uploads are switched off.",
    );
  });

  it("documents the upload body as zstd or gzip bytes, and publishes the document inside as MeasurementBatch", { timeout: 30_000 }, () => {
    const options = buildSwaggerOptions("/api/v2");
    const transform = options.transform as SwaggerTransform;
    const transformObject = options.transformObject as SwaggerTransformObject;
    const openapiObject = options.openapi ?? {};
    const route = { ...putMeasurementUpload, url: "/api/v2/measurements/uploads/:id" } as unknown as RouteOptions;
    const { schema } = transform({
      schema: putMeasurementUpload.schema ?? {},
      url: route.url,
      route,
      openapiObject,
    } as unknown as Parameters<SwaggerTransform>[0]);
    const document = transformObject({ openapiObject: { ...openapiObject, paths: {} } } as unknown as Parameters<SwaggerTransformObject>[0]) as {
      components: { schemas: Record<string, { properties?: object }> };
    };

    expect(schema).toMatchObject({ consumes: ["application/zstd", "application/gzip"], body: { type: "string", format: "binary" } });
    expect(document.components.schemas.MeasurementBatch?.properties).toHaveProperty("snapshots");
  });
});
