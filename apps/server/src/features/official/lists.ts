import type { FastifyRequest } from "fastify";

import { actorIdFromRequest } from "../access/access.js";
import { type UserListMembership, assertListsEnabled, findListForViewer, getUserListMembership } from "../lists/visibility.js";

async function listMembership(req: FastifyRequest, listId: string | undefined): Promise<UserListMembership | null> {
  if (listId === undefined) return null;

  assertListsEnabled();
  return getUserListMembership(await findListForViewer(req, listId, actorIdFromRequest(req)));
}

export async function listOfficialSiteIds(req: FastifyRequest, listId: string | undefined): Promise<number[] | null> {
  return (await listMembership(req, listId))?.official ?? null;
}

export async function listMicrowaveLinkIds(req: FastifyRequest, listId: string | undefined): Promise<number[] | null> {
  return (await listMembership(req, listId))?.microwaveLinks ?? null;
}
