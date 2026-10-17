import { userLists } from "@openbts/drizzle";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify";
import type { z } from "zod/v4";

import db from "../../database/psql.js";
import { ErrorResponse } from "../../errors.js";
import { getRuntimeSettings } from "../../lib/runtimeSettings.js";
import { hasStaffPermission } from "../access/staff.js";

export const userListSelectSchema = createSelectSchema(userLists);
export type UserListRow = z.infer<typeof userListSelectSchema>;

export type UserListMembership = {
  internal: number[];
  official: number[];
  microwaveLinks: number[];
};

export async function getVisibleUserList(req: FastifyRequest, uuid: string): Promise<UserListRow> {
  if (!getRuntimeSettings().enableUserLists) throw new ErrorResponse("FORBIDDEN");

  const list = await db.query.userLists.findFirst({ where: { uuid } });
  if (!list) throw new ErrorResponse("NOT_FOUND");

  if (!list.is_public) {
    const userId = req.userSession?.user.id;
    if (!userId) throw new ErrorResponse("UNAUTHORIZED");
    const isAdmin = await hasStaffPermission(req, { user_lists: ["read_all"] });
    if (!isAdmin && userId !== list.created_by) throw new ErrorResponse("NOT_FOUND");
  }

  return list;
}

export function assertListsEnabled(): void {
  if (!getRuntimeSettings().enableUserLists) throw new ErrorResponse("FEATURE_DISABLED");
}

export async function findListForViewer(req: FastifyRequest, publicId: string, viewerId: string | null): Promise<UserListRow> {
  const list = await db.query.userLists.findFirst({ where: { uuid: publicId } });
  if (!list) throw new ErrorResponse("NOT_FOUND");
  if (list.is_public || list.created_by === viewerId) return list;

  if (!(await hasStaffPermission(req, { user_lists: ["read_all"] }))) throw new ErrorResponse("NOT_FOUND");
  return list;
}

export function getUserListMembership(list: Pick<UserListRow, "stations" | "radiolines">): UserListMembership {
  const stationMembership = (list.stations as { internal?: number[]; official?: number[] } | null) ?? {};
  return {
    internal: stationMembership.internal ?? [],
    official: stationMembership.official ?? [],
    microwaveLinks: (list.radiolines as number[] | null) ?? [],
  };
}
