import { z } from "zod/v4";

import { userRefSchema } from "./common.ts";
import { roleGrantSchema } from "./roleGrants.ts";
import { ANALYZER_SUBMISSIONS_LIMIT } from "./submissions.ts";

export const USER_ROLES = ["user", "editor", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

const ANALYZER_CHANGES_NOTE =
  "The limit on changes you send to `POST /submissions` with `origin` set to `analyzer`. " +
  `You can submit ${ANALYZER_SUBMISSIONS_LIMIT.max} of them in any ${ANALYZER_SUBMISSIONS_LIMIT.windowHours} hours. ` +
  "One change is one item of the request, so one submission for one station, however many cells it changes. " +
  "`null` if the limit does not apply to you. Editors and administrators are exempt, except when they use an API key";
const ANALYZER_CHANGES_REMAINING_NOTE =
  "How many more you can submit right now. A request with more analyzer changes than this fails as a whole with 429. " +
  "A submission you withdraw no longer counts, while an accepted or rejected one still does";
const ANALYZER_CHANGES_RESETS_NOTE =
  `The moment the oldest change that counts turns ${ANALYZER_SUBMISSIONS_LIMIT.windowHours} hours old, ` +
  "which is when `remaining` starts to grow again. " +
  "When `POST /submissions` responds with 429 because of this limit, its `X-Retry-After` header counts down to the same moment. " +
  "`null` if no change counts right now";

export const analyzerChangesLimitSchema = z.object({
  limit: z.number().int().describe(`The number of analyzer changes you can submit in any ${ANALYZER_SUBMISSIONS_LIMIT.windowHours} hours`),
  remaining: z.number().int().describe(ANALYZER_CHANGES_REMAINING_NOTE),
  resetsAt: z.iso.datetime().nullable().describe(ANALYZER_CHANGES_RESETS_NOTE),
});
export type AnalyzerChangesLimit = z.infer<typeof analyzerChangesLimitSchema>;

export const meSchema = userRefSchema.extend({
  role: z.enum(USER_ROLES).describe("Your role on the site. An `editor` can edit where their grants allow, and an `admin` can edit everywhere"),
  grants: z.array(roleGrantSchema).describe("The countries, or regions of a country, that you can edit or maintain. Empty unless `role` is `editor`"),
  limits: z.object({
    lists: z.number().int().describe("The number of lists you can have"),
    analyzerChanges: analyzerChangesLimitSchema.nullable().describe(ANALYZER_CHANGES_NOTE),
  }),
});
export type Me = z.infer<typeof meSchema>;
