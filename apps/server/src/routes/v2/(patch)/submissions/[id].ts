import { submissionParamsSchema, submissionSchema, submissionUpdateSchema } from "@openbts/shared/contract";
import type { Submission, SubmissionUpdate } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../errors.js";
import { actorIdFromRequest } from "../../../../features/access/access.js";
import { findSubmission } from "../../../../features/submissions/read.js";
import { serializeSubmissions } from "../../../../features/submissions/serialize.js";
import { toPhotoPickUpdate, toSubmissionUpdateInput } from "../../../../features/submissions/translate.js";
import {
  assertDeleteCarriesOnlyNotes,
  findEditableSubmission,
  getTargetStationId,
  updateSubmission,
} from "../../../../features/submissions/update.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { getRuntimeSettings } from "../../../../lib/runtimeSettings.js";

const NOTE_FIELDS = new Set(["note", "reviewNote"]);

const schemaRoute = {
  summary: "Update a submission",
  description:
    "You can change your own submission while it is pending. " +
    "Administrators, and editors whose grant covers everything the submission touches, can change it as well.\n\n" +
    "Any of `station`, `location`, `sectors`, `cells` and `photos` you send replaces that part of the submission. " +
    "`reviewNote` is the only field that can still change after the review. " +
    "`isConfirmed` on a new cell is only kept when one of those administrators and editors sends it.\n\n" +
    "A new owner name in `location.structure.ownerName` requires `features.structureOwnerProposals` on `GET /settings` to be enabled. " +
    "A name that resolves to an existing owner, or the unchanged pending name in the same country, is allowed while proposals are disabled.\n\n" +
    "A submission that removes a station has no changes to edit, only its notes.",
  params: submissionParamsSchema,
  body: submissionUpdateSchema,
  response: {
    200: z.object({
      data: submissionSchema,
    }),
  },
};
const errorReasons = {
  400:
    "The update would change nothing, or the new content breaks a rule that also applies when creating a submission. " +
    "Once a submission has been reviewed, only `reviewNote` can be changed.",
  403:
    "You are not allowed to change this submission or to set `reviewNote`. " +
    "Also returned when submissions are disabled or the change is in a country that is closed to contributions. " +
    "A new structure owner proposal while proposals are disabled points `details[0].field` at `location/structure/ownerName`.",
  404: "The submission's station is `inactive`, or a cell you referenced is not on that station.",
  409:
    "An active station already has a cell with the same identity on one of the cell's networks: " +
    "`lac` and `cid` for GSM, `rnc` and `cid` for UMTS, `enbid` and `clid` for LTE, `nci` for NR. " +
    "Also returned when the station already has an LTE or NR cell with the same `pci` on the same band, " +
    "or when the submission was reviewed while your request was being processed.",
};
type RequestData = { Params: z.infer<typeof submissionParamsSchema>; Body: SubmissionUpdate };

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<Submission>>) {
  if (!getRuntimeSettings().submissionsEnabled) throw new ErrorResponse("FEATURE_DISABLED");
  const { id } = req.params;
  const userId = actorIdFromRequest(req);
  if (userId === null) throw new ErrorResponse("UNAUTHORIZED");

  const editable = await findEditableSubmission(req, id, userId);
  const { submission } = editable;
  const fields = Object.keys(req.body);
  if (submission.status !== "pending" && fields.some((field) => field !== "reviewNote")) {
    throw new ErrorResponse("BAD_REQUEST", { message: "Only the review note of a reviewed submission can be changed" });
  }
  assertDeleteCarriesOnlyNotes(
    submission,
    fields.some((field) => !NOTE_FIELDS.has(field)),
  );

  const { photos, ...changes } = req.body;
  const { station } = changes;
  if (submission.type === "new" && station && station.operatorId === undefined) {
    throw new ErrorResponse("BAD_REQUEST", { message: "operatorId is required for a new station" });
  }
  if (submission.type === "new" && station?.backhaul && station.backhaul.medium === undefined) {
    throw new ErrorResponse("BAD_REQUEST", { message: "medium is required for a new station's backhaul" });
  }

  const [input, picks] = await Promise.all([
    toSubmissionUpdateInput(getTargetStationId(submission), changes, { submissionId: id }),
    photos === undefined ? undefined : toPhotoPickUpdate(submission, photos, changes.location),
  ]);
  await updateSubmission(req, editable, input, picks);

  const row = await findSubmission(id);
  if (!row) throw new ErrorResponse("NOT_FOUND");
  const [updated] = await serializeSubmissions(req, [row]);
  if (!updated) throw new ErrorResponse("NOT_FOUND");

  return res.send({ data: updated });
}

const patchSubmission: Route<RequestData, Submission> = {
  url: "/submissions/:id",
  method: "PATCH",
  config: { permissions: ["update:submissions"], errorReasons },
  schema: schemaRoute,
  handler,
};

export default patchSubmission;
