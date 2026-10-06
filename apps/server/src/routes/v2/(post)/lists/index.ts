import { userLists } from "@openbts/drizzle";
import { listCreateSchema, listSchema } from "@openbts/shared/contract";
import type { List, ListCreate } from "@openbts/shared/contract";
import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../errors.js";
import { actorIdFromRequest } from "../../../../features/access/access.js";
import { runAuditedOperation, standaloneAuditContext } from "../../../../features/audit/index.js";
import { loadHiddenCountryCodes } from "../../../../features/countries/visibility.js";
import { assertItemsExist } from "../../../../features/lists/items.js";
import { MAX_USER_LISTS } from "../../../../features/lists/limits.js";
import { toList } from "../../../../features/lists/serialize.js";
import { assertListsEnabled } from "../../../../features/lists/visibility.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Create a list",
  description:
    "Creates a list and returns it. You can have up to 15 lists, and each of them needs its own name. " +
    "A new list is private and has notifications turned off unless you set `isPublic` or `notificationsEnabled`. " +
    "Every item you add has to exist, and stations in countries you cannot access count as missing.",
  body: listCreateSchema,
  response: {
    201: z.object({
      data: listSchema,
    }),
  },
};
const errorReasons = {
  400:
    "The request is invalid, you already have 15 lists (`LIST_LIMIT_REACHED`), or some of the items do not exist. " +
    "In the last case `details` lists the missing ids.",
  403: "Lists are disabled.",
  409: "You already have a list with this name.",
};
type ReqBody = { Body: ListCreate };

async function handler(req: FastifyRequest<ReqBody>, res: ReplyPayload<JSONBody<List>>) {
  assertListsEnabled();
  const userId = actorIdFromRequest(req);
  if (userId === null) throw new ErrorResponse("UNAUTHORIZED");

  const { name, description, isPublic = false, notificationsEnabled = false, items = {} } = req.body;
  const hidden = await loadHiddenCountryCodes(req);

  try {
    const created = await runAuditedOperation(standaloneAuditContext(req), { kind: "list.create" }, async (tx, audit) => {
      const owned = await tx.select({ name: userLists.name }).from(userLists).where(eq(userLists.created_by, userId));
      if (owned.length >= MAX_USER_LISTS) {
        throw new ErrorResponse("LIST_LIMIT_REACHED", { message: `You have reached the maximum limit of ${MAX_USER_LISTS} lists` });
      }
      if (owned.some((list) => list.name === name)) throw new ErrorResponse("CONFLICT", { message: "You already have a list with this name" });

      await assertItemsExist(tx, items, hidden);

      const [result] = await tx
        .insert(userLists)
        .values({
          name,
          description: description || null,
          is_public: isPublic,
          notificationsEnabled,
          created_by: userId,
          stations: { internal: [...new Set(items.stationIds)], uke: [...new Set(items.officialSiteIds)] },
          radiolines: [...new Set(items.microwaveLinkIds)],
        })
        .returning();
      if (!result) throw new ErrorResponse("FAILED_TO_CREATE");

      await audit.log({ entity: "user_lists", op: "create", recordId: result.id, new: result });
      return result;
    });

    return res.status(201).send({ data: toList(created, userId) });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_CREATE", { cause: error });
  }
}

const createList: Route<ReqBody, List> = {
  url: "/lists",
  method: "POST",
  config: { permissions: ["create:user_lists"], errorReasons },
  schema: schemaRoute,
  handler,
};

export default createList;
