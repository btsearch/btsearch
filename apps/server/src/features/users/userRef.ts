import { users } from "@openbts/drizzle";
import type { UserRef } from "@openbts/shared/contract";
import { inArray } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify";
import type { z } from "zod/v4";

import { STAFF_ROLES } from "../../constants.js";
import db from "../../database/psql.js";
import { unique } from "../../lib/collections.js";
import { actorIdFromRequest } from "../access/access.js";
import { sessionOrTokenAccessFromRequest } from "../access/staff.js";

const userRefRowSchema = createSelectSchema(users).pick({ id: true, username: true, name: true, image: true });

type UserRefRow = z.infer<typeof userRefRowSchema>;

export type UserRefViewer = { userId: string | null; isStaff: boolean };
export type PublicUserRow = UserRef & { profileVisibility: string };

export async function loadUserRefViewer(req: FastifyRequest): Promise<UserRefViewer> {
  const access = await sessionOrTokenAccessFromRequest(req);
  return { userId: actorIdFromRequest(req), isStaff: access !== null && STAFF_ROLES.has(access.role) };
}

export function toUserRef(user: UserRefRow): UserRef {
  return { id: user.id, username: user.username, name: user.name, image: user.image };
}

export async function loadUserRefs(userIds: readonly (string | null)[]): Promise<Map<string, UserRef>> {
  const ids = unique(userIds);
  if (ids.length === 0) return new Map();

  const found = await db
    .select({ id: users.id, username: users.username, name: users.name, image: users.image })
    .from(users)
    .where(inArray(users.id, ids));
  return new Map(found.map((user) => [user.id, toUserRef(user)]));
}

export function toPublicUserRef(user: PublicUserRow, viewer: UserRefViewer): UserRef {
  const showsName = user.profileVisibility === "public" || viewer.isStaff || viewer.userId === user.id;
  return { id: user.id, username: user.username, name: showsName ? user.name : null, image: user.image };
}
