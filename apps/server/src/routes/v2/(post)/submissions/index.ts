import { users } from "@openbts/drizzle";
import { submissionCreateManySchema, submissionSchema } from "@openbts/shared/contract";
import type { Submission, SubmissionCreate } from "@openbts/shared/contract";
import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import { actorIdFromRequest } from "../../../../features/access/access.js";
import { findVisibleStation } from "../../../../features/stations/read.js";
import { assertAnalyzerLimit } from "../../../../features/submissions/analyzerLimit.js";
import { serializeSubmissions } from "../../../../features/submissions/serialize.js";
import { submitSubmissions } from "../../../../features/submissions/submit.js";
import { toSingleSubmission } from "../../../../features/submissions/translate.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { unique } from "../../../../lib/collections.js";
import { pointRefusalsAtItem } from "../../../../lib/itemRefusals.js";
import { getRuntimeSettings } from "../../../../lib/runtimeSettings.js";

const schemaRoute = {
  summary: "Create submissions",
  description:
    "Creates one pending submission for each change in the request, up to 50, and returns them in the same order. " +
    "Nothing in the data changes yet. Every submission waits for an editor to review it. " +
    "`origin` is only a label and does not change that.\n\n" +
    "The request is all or nothing, so if one change fails, none of them is saved. " +
    "When a request fails because of one change, `details[0].field` in the error is that change's position in the request, " +
    "starting at 0. For an invalid value it is the full path, such as `0/cells/1/pci` for change 0, cell 1. " +
    "Countries that are closed to contributions do not accept submissions.\n\n" +
    "Changes prepared from a phone log carry `origin` set to `analyzer`, and you can submit 100 of them in any 32 hours. " +
    "Each change in the request counts as one, however many cells it changes. " +
    "`limits.analyzerChanges` on `GET /me` tells you how many you have left.\n\n" +
    "If the owner of a structure is not in the list of structure owners yet, send its name in `location.structure.ownerName` " +
    "instead of an `ownerId`. The owner is only added to the list when the submission is accepted.\n\n" +
    "Upload photos afterwards with `POST /submissions/{id}/photos`, and use `photos.uploadCount` to say how many are coming. " +
    "A new station without cells needs at least one photo. " +
    "If you announce photos and none is uploaded within 10 minutes, the submission is deleted when it is a new station without cells " +
    "or an update with no other changes, and you get a notification about it.",
  body: submissionCreateManySchema,
  response: {
    201: z.object({
      data: z.array(submissionSchema),
    }),
  },
};
const errorReasons = {
  400:
    "The request is invalid, or a change cannot be accepted as it is. Typical cases are an update that changes nothing, " +
    "a new station whose site id the operator already uses, a new station with neither cells nor photos, " +
    "or a band that is not in the country's band plan. " +
    "A cell update that names only the cell's `id` is rejected too, because it needs at least one field to change, " +
    "which can be a field set to `null`. That error points at the cell, for example `0/cells/1` for change 0, cell 1, " +
    "and nothing in the request is saved or counted towards the limit on analyzer changes.",
  403:
    "Submissions are disabled, or one of the changes is in a country that is closed to contributions. " +
    "This response does not say which change it is about.",
  404:
    "A station you referenced does not exist, is `inactive`, or is in a country you cannot access. " +
    "Also returned when a cell you referenced is not on that station.",
  409:
    "The operator already has a GSM cell with the same `lac` and `cid`, a UMTS cell with the same `rnc` and `cid`, " +
    "or an LTE cell on an active station with the same `enbid` and `clid`. " +
    "Also returned when the station already has an LTE or NR cell with the same `pci` on the same band.",
  429:
    "You are sending too many requests, or this request would take you past 100 changes with `origin` set to `analyzer` in 32 hours. " +
    "Editors and administrators are exempt from that limit, except when they use an API key. " +
    "When it is the reason, the `message` is `At most 100 analyzer changes in 32 hours`, " +
    "and `X-Retry-After` is the number of seconds until the oldest change that counts is 32 hours old. " +
    "That is the moment in `limits.analyzerChanges.resetsAt` on `GET /me`, and from then on you can submit at least one more.",
};
type ReqBody = { Body: SubmissionCreate[] };

async function assertStationsVisible(req: FastifyRequest, changes: readonly SubmissionCreate[]): Promise<void> {
  const stationIds = unique(changes.map((change) => change.stationId));
  await Promise.all(
    stationIds.map((stationId) => {
      const index = changes.findIndex((change) => change.stationId === stationId);
      return pointRefusalsAtItem(index, () => findVisibleStation(req, stationId));
    }),
  );
}

async function handler(req: FastifyRequest<ReqBody>, res: ReplyPayload<JSONBody<Submission[]>>) {
  if (!getRuntimeSettings().submissionsEnabled) throw new ErrorResponse("FEATURE_DISABLED");
  const userId = actorIdFromRequest(req);
  if (userId === null) throw new ErrorResponse("UNAUTHORIZED");
  await assertAnalyzerLimit(req, res, userId, req.body.filter((change) => change.origin === "analyzer").length);
  await assertStationsVisible(req, req.body);

  const [changes, [submitter]] = await Promise.all([
    Promise.all(req.body.map((change, index) => pointRefusalsAtItem(index, () => toSingleSubmission(change, (path) => [index, ...path])))),
    db.select({ name: users.name, username: users.username }).from(users).where(eq(users.id, userId)).limit(1),
  ]);
  if (!submitter) throw new ErrorResponse("UNAUTHORIZED");

  const created = await submitSubmissions(req, changes, { id: userId, name: submitter.name || submitter.username || "Unknown" });

  return res.status(201).send({ data: await serializeSubmissions(req, created) });
}

const createSubmissions: Route<ReqBody, Submission[]> = {
  url: "/submissions",
  method: "POST",
  config: { permissions: ["create:submissions"], errorReasons },
  schema: schemaRoute,
  handler,
};

export default createSubmissions;
