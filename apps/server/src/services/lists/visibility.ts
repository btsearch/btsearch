import { userLists } from "@openbts/drizzle";
import { createSelectSchema } from "drizzle-orm/zod";
import type { z } from "zod/v4";

import db from "../../database/psql.js";
import { ErrorResponse } from "../../errors.js";
import { verifyPermissions } from "../../plugins/auth/utils.js";
import { getRuntimeSettings } from "../settings.service.js";

export const userListSelectSchema = createSelectSchema(userLists);
export type UserListRow = z.infer<typeof userListSelectSchema>;

export type UserListMembership = {
  internal: number[];
  uke: number[];
  radiolines: number[];
};

export async function getVisibleUserList(uuid: string, userId: string | undefined): Promise<UserListRow> {
  if (!getRuntimeSettings().enableUserLists) throw new ErrorResponse("FORBIDDEN");

  const list = await db.query.userLists.findFirst({ where: { uuid } });
  if (!list) throw new ErrorResponse("NOT_FOUND");

  if (!list.is_public) {
    if (!userId) throw new ErrorResponse("UNAUTHORIZED");
    const isAdmin = await verifyPermissions(userId, { user_lists: ["read"] });
    if (!isAdmin && userId !== list.created_by) throw new ErrorResponse("NOT_FOUND");
  }

  return list;
}

export function getUserListMembership(list: UserListRow): UserListMembership {
  const stationMembership = (list.stations as { internal?: number[]; uke?: number[] } | null) ?? {};
  return {
    internal: stationMembership.internal ?? [],
    uke: stationMembership.uke ?? [],
    radiolines: (list.radiolines as number[] | null) ?? [],
  };
}
