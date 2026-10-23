import type { SwaggerTransform, SwaggerTransformObject } from "@fastify/swagger";
import type { RouteOptions } from "fastify";
import { describe, expect, it } from "vitest";

import { buildSwaggerOptions, findDocumentationGap } from "../../../src/features/openapi/document.js";
import { planErrorResponses } from "../../../src/features/openapi/errorResponses.js";
import { securityFor } from "../../../src/features/openapi/security.js";
import type { RouteCaller } from "../../../src/plugins/auth/appClient.js";
import getMeasurementConfig from "../../../src/routes/v2/(get)/measurements/config.js";
import getMeasurementDevice from "../../../src/routes/v2/(get)/measurements/devices/[id].js";
import getMeasurementDevices from "../../../src/routes/v2/(get)/measurements/devices/index.js";
import getMeasurementTerms from "../../../src/routes/v2/(get)/measurements/terms.js";
import getMeasurementUpload from "../../../src/routes/v2/(get)/measurements/uploads/[id].js";
import getMeasurementUploadFile from "../../../src/routes/v2/(get)/measurements/uploads/[id]/file.js";
import getMeasurementUploads from "../../../src/routes/v2/(get)/measurements/uploads/index.js";
import updateMeasurementDevice from "../../../src/routes/v2/(patch)/measurements/devices/[id].js";
import updateMeasurementUpload from "../../../src/routes/v2/(patch)/measurements/uploads/[id].js";
import createDeviceChallenge from "../../../src/routes/v2/(post)/measurements/device-challenges.js";
import registerMeasurementDevice from "../../../src/routes/v2/(post)/measurements/devices/index.js";
import excludeMeasurementUploads from "../../../src/routes/v2/(post)/measurements/uploads/exclusions.js";
import withdrawMeasurementUploads from "../../../src/routes/v2/(post)/measurements/uploads/withdrawals.js";
import acceptMeasurementTerms from "../../../src/routes/v2/(put)/measurements/terms.js";
import putMeasurementUpload from "../../../src/routes/v2/(put)/measurements/uploads/[id].js";

describe("v2 measurement routes", () => {
  it.each([
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
  ])("$method $url can be documented", (route) => {
    expect(findDocumentationGap(route as unknown as RouteOptions)).toBeUndefined();
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

  it("documents the upload body as zstd or gzip bytes, and publishes the document inside as MeasurementBatch", () => {
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
