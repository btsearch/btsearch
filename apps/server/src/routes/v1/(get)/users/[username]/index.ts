import { stationComments } from "@openbts/drizzle";
import { and, eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { STAFF_ROLES } from "../../../../../constants.js";
import db from "../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../errors.js";
import { stationIdInLegacyCountry } from "../../../../../features/countries/legacy.js";
import { normalizeContact } from "../../../../../features/users/profile.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";
import { getRuntimeSettings } from "../../../../../lib/runtimeSettings.js";

const COMMENTS_LIMIT = 50;

const profileUserSchema = z.object({
  id: z.string(),
  username: z.string().nullable(),
  name: z.string().nullable(),
  image: z.string().nullable(),
  bio: z.string().nullable(),
  role: z.string().nullable(),
  createdAt: z.date(),
});

const contactSchema = z.object({
  instagram: z.string().nullable(),
  facebook: z.string().nullable(),
  email: z.string().nullable(),
});

const commentSchema = z.object({
  id: z.string(),
  content: z.string(),
  createdAt: z.date(),
  station: z.object({
    id: z.number(),
    station_id: z.string().nullable(),
    city: z.string().nullable(),
    operator: z.object({ id: z.number(), name: z.string(), mnc: z.number().nullable() }).nullable(),
  }),
});

const commentsSchema = z.object({
  totalCount: z.number(),
  items: z.array(commentSchema),
});

const profileSchema = z.object({
  user: profileUserSchema,
  visibility: z.enum(["public", "private"]),
  restricted: z.boolean(),
  contact: contactSchema.nullable(),
  contactHidden: z.boolean(),
  hunter: z.object({ regions: z.array(z.number()) }).nullable(),
  comments: commentsSchema.nullable(),
});

const schemaRoute = {
  params: z.object({ username: z.string() }),
  response: {
    200: z.object({ data: profileSchema }),
  },
};

type ReqParams = { Params: z.infer<typeof schemaRoute.params> };
type ProfileData = z.infer<typeof profileSchema>;
type ProfileComments = z.infer<typeof commentsSchema>;

async function findApprovedComments(userId: string): Promise<ProfileComments> {
  const approved = and(eq(stationComments.user_id, userId), eq(stationComments.status, "approved"));
  const [totalCount, comments] = await Promise.all([
    db.$count(stationComments, and(approved, stationIdInLegacyCountry(stationComments.station_id))),
    db.query.stationComments.findMany({
      where: {
        AND: [{ user_id: { eq: userId } }, { status: { eq: "approved" } }],
        RAW: (fields) => stationIdInLegacyCountry(fields.station_id),
      },
      columns: { id: true, content: true, createdAt: true, station_id: true },
      orderBy: { createdAt: "desc" },
      limit: COMMENTS_LIMIT,
      with: {
        station: {
          columns: { station_id: true },
          with: {
            location: { columns: { city: true } },
            operator: { columns: { id: true, name: true, mnc: true } },
          },
        },
      },
    }),
  ]);

  return {
    totalCount,
    items: comments.map(({ station, ...comment }) => ({
      id: comment.id,
      content: comment.content,
      createdAt: comment.createdAt,
      station: {
        id: comment.station_id,
        station_id: station?.station_id ?? null,
        city: station?.location?.city ?? null,
        operator: station?.operator ?? null,
      },
    })),
  };
}

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<ProfileData>>) {
  const viewer = req.userSession?.user;

  const user = await db.query.users.findFirst({
    where: { username: req.params.username.toLowerCase() },
    columns: {
      id: true,
      username: true,
      name: true,
      image: true,
      bio: true,
      role: true,
      contactInfo: true,
      profileVisibility: true,
      hunterListing: true,
      hunterRegions: true,
      createdAt: true,
    },
  });

  if (!user) throw new ErrorResponse("NOT_FOUND");

  const visibility = user.profileVisibility === "public" ? "public" : "private";
  const restricted = visibility === "private" && viewer?.id !== user.id;
  const canSeeIdentity = !restricted || STAFF_ROLES.has(viewer?.role ?? "");
  const contact = restricted ? null : normalizeContact(user.contactInfo);
  const hunterRegions = user.hunterRegions ?? [];
  const commentsEnabled = getRuntimeSettings().enableStationComments;

  res.header("Cache-Control", "private, no-store");
  return res.send({
    data: {
      user: {
        id: user.id,
        username: user.username,
        name: canSeeIdentity ? user.name : null,
        image: user.image,
        bio: restricted ? null : user.bio,
        role: canSeeIdentity ? user.role : null,
        createdAt: user.createdAt,
      },
      visibility,
      restricted,
      contact: viewer ? contact : null,
      contactHidden: !viewer && contact !== null,
      hunter: visibility === "public" && user.hunterListing && hunterRegions.length > 0 ? { regions: hunterRegions } : null,
      comments: restricted || !commentsEnabled ? null : await findApprovedComments(user.id),
    },
  });
}

const getUserProfile: Route<ReqParams, ProfileData> = {
  url: "/users/:username",
  method: "GET",
  config: { allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getUserProfile;
