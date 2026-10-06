import { z } from "zod/v4";

import {
  AT_LEAST_ONE_FIELD_ISSUE,
  CURSOR_OR_OFFSET_ISSUE,
  INCLUDE_TOTAL_NOTE,
  booleanQuerySchema,
  csvEnumSchema,
  csvUuidsSchema,
  cursorSchema,
  hasAnyField,
  idParamSchema,
  limitSchema,
  offsetSchema,
  pagingSchema,
  userRefSchema,
  usesCursorOrOffset,
} from "./common.ts";
import { stationBaseSchema, stationLocationSchema } from "./stations.ts";

export const COMMENT_STATUSES = ["pending", "approved"] as const;
export type CommentStatus = (typeof COMMENT_STATUSES)[number];

export const COMMENT_INCLUDES = ["station", "station.location"] as const;
export type CommentInclude = (typeof COMMENT_INCLUDES)[number];

export const COMMENT_SORTS = ["-createdAt", "createdAt"] as const;
export type CommentSort = (typeof COMMENT_SORTS)[number];

export const COMMENT_MAX_LENGTH = 1000;
export const COMMENT_PHOTO_LIMIT = 5;
export const COMMENT_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

const commentContentSchema = z.string().trim().min(1).max(COMMENT_MAX_LENGTH);

export const commentAttachmentSchema = z.object({
  id: z.uuid(),
  url: z.string().describe("The path of the image, from the site root. A WebP image of at most 2048 pixels per side"),
});
export type CommentAttachment = z.infer<typeof commentAttachmentSchema>;

export const commentStationSchema = stationBaseSchema.extend({
  location: stationLocationSchema.nullable().optional().describe("Only returned with `include=station.location`"),
});
export type CommentStation = z.infer<typeof commentStationSchema>;

export const commentSchema = z.object({
  id: z.uuid(),
  stationId: z.number().int(),
  content: z.string(),
  status: z
    .enum(COMMENT_STATUSES)
    .describe("`pending` comments are waiting for a moderator's approval. They are only returned to their author and to moderators"),
  attachments: z.array(commentAttachmentSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  author: userRefSchema.describe("`name` is `null` for private profiles, unless you are the author or a staff member"),
  station: commentStationSchema.optional().describe("Only returned with `include=station`"),
});
export type Comment = z.infer<typeof commentSchema>;

export const commentParamsSchema = z.object({ id: z.uuid() });
export const stationCommentsParamsSchema = z.object({ id: idParamSchema });

const INCLUDE_PENDING_NOTE =
  "If `true`, every `pending` comment on the station is returned too, not just your own. " +
  "Requires the `moderate:comments` permission, and editors also need a grant that covers the station";

export const stationCommentsQuerySchema = z.object({ includePending: booleanQuerySchema.optional().describe(INCLUDE_PENDING_NOTE) }).strict();
export type StationCommentsQuery = z.infer<typeof stationCommentsQuerySchema>;

export const commentListQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(100).optional().describe("Matches part of the comment's text or of the station's site id"),
    authorIds: csvUuidsSchema.optional(),
    statuses: csvEnumSchema(COMMENT_STATUSES)
      .optional()
      .describe(`If omitted, comments in both statuses are returned. Comma-separated list. Possible values: \`${COMMENT_STATUSES.join("`, `")}\``),
    sort: z.enum(COMMENT_SORTS).default("-createdAt").describe("The field to sort by, with a leading `-` for descending order"),
    include: csvEnumSchema(COMMENT_INCLUDES).optional(),
    limit: limitSchema,
    cursor: cursorSchema.optional(),
    offset: offsetSchema.optional(),
    includeTotal: booleanQuerySchema.optional().describe(INCLUDE_TOTAL_NOTE),
  })
  .strict()
  .refine(usesCursorOrOffset, CURSOR_OR_OFFSET_ISSUE);
export type CommentListQuery = z.infer<typeof commentListQuerySchema>;

export const commentListSchema = z.object({
  data: z.array(commentSchema),
  paging: pagingSchema,
});
export type CommentList = z.infer<typeof commentListSchema>;

export const commentCreateSchema = z.object({
  content: commentContentSchema,
  files: z.array(z.file().max(COMMENT_PHOTO_MAX_BYTES)).max(COMMENT_PHOTO_LIMIT).optional().describe("Images to attach, up to 5 MB each"),
});

export const commentUpdateSchema = z
  .object({
    content: commentContentSchema.optional(),
    status: z
      .enum(COMMENT_STATUSES)
      .optional()
      .describe("Only moderators can set it. Approving a pending comment notifies the users who watch the station"),
  })
  .strict()
  .refine(hasAnyField, AT_LEAST_ONE_FIELD_ISSUE);
export type CommentUpdate = z.infer<typeof commentUpdateSchema>;
