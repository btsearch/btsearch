import { userLists } from "@openbts/drizzle";
import { listParamsSchema, listSchema, listUpdateSchema } from "@openbts/shared/contract";
import type { List, ListUpdate } from "@openbts/shared/contract";
import { and, eq, ne } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../errors.js";
import { actorIdFromRequest } from "../../../../features/access/access.js";
import { hasStaffPermission } from "../../../../features/access/staff.js";
import { runAuditedOperation, standaloneAuditContext } from "../../../../features/audit/index.js";
import { loadHiddenCountryCodes } from "../../../../features/countries/visibility.js";
import { applyItemChanges, assertItemsExist, itemsNotStored } from "../../../../features/lists/items.js";
import { toLists } from "../../../../features/lists/serialize.js";
import { assertListsEnabled, findListForViewer, getUserListMembership } from "../../../../features/lists/visibility.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Update a list",
  description:
    "Updates a list and returns it. You need to be the owner or an administrator. " +
    "Every item you add has to exist, and stations in countries you cannot access count as missing.",
  params: listParamsSchema,
  body: listUpdateSchema,
  response: {
    200: z.object({
      data: listSchema,
    }),
  },
};
const errorReasons = {
  400: "The request is invalid, or some of the items you add do not exist. In that case `details` lists the missing ids.",
  403: "Lists are disabled, or the list is not yours and you are not an administrator.",
  404: "The list does not exist, or it is private and not yours.",
  409: "The owner already has another list with this name.",
};
type RequestData = { Params: z.infer<typeof listParamsSchema>; Body: ListUpdate };

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<List>>) {
  assertListsEnabled();
  const userId = actorIdFromRequest(req);
  if (userId === null) throw new ErrorResponse("UNAUTHORIZED");

  const { name, description, isPublic, notificationsEnabled, items, addItems, removeItems } = req.body;

  const list = await findListForViewer(req, req.params.id, userId);
  if (list.created_by !== userId && !(await hasStaffPermission(req, { user_lists: ["manage_all"] }))) throw new ErrorResponse("FORBIDDEN");
  const hidden = await loadHiddenCountryCodes(req);

  try {
    const updated = await runAuditedOperation(standaloneAuditContext(req), { kind: "list.update" }, async (tx, audit) => {
      const [current] = await tx.select().from(userLists).where(eq(userLists.id, list.id)).for("update").limit(1);
      if (!current) throw new ErrorResponse("NOT_FOUND");

      if (name !== undefined && name !== current.name) {
        const [sameName] = await tx
          .select({ id: userLists.id })
          .from(userLists)
          .where(and(eq(userLists.created_by, current.created_by), eq(userLists.name, name), ne(userLists.id, current.id)))
          .limit(1);
        if (sameName) throw new ErrorResponse("CONFLICT", { message: "The owner already has a list with this name" });
      }
      if (addItems) await assertItemsExist(tx, addItems, hidden);

      const membership = getUserListMembership(current);
      if (items) await assertItemsExist(tx, itemsNotStored(items, membership), hidden);
      const changesItems = items !== undefined || addItems !== undefined || removeItems !== undefined;
      const next = {
        internal: applyItemChanges(items?.stationIds ?? membership.internal, addItems?.stationIds, removeItems?.stationIds),
        uke: applyItemChanges(items?.officialSiteIds ?? membership.uke, addItems?.officialSiteIds, removeItems?.officialSiteIds),
        radiolines: applyItemChanges(items?.microwaveLinkIds ?? membership.radiolines, addItems?.microwaveLinkIds, removeItems?.microwaveLinkIds),
      };

      const [result] = await tx
        .update(userLists)
        .set({
          name,
          description: description === undefined ? undefined : description || null,
          is_public: isPublic,
          notificationsEnabled,
          stations: changesItems ? { internal: next.internal, uke: next.uke } : undefined,
          radiolines: changesItems ? next.radiolines : undefined,
          updatedAt: new Date(),
        })
        .where(eq(userLists.id, current.id))
        .returning();
      if (!result) throw new ErrorResponse("FAILED_TO_UPDATE");

      await audit.log({ entity: "user_lists", op: "update", recordId: result.id, old: current, new: result });
      return result;
    });

    const [serialized] = await toLists([updated], userId, hidden);
    if (!serialized) throw new ErrorResponse("FAILED_TO_UPDATE");

    return res.send({ data: serialized });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_UPDATE", { cause: error });
  }
}

const updateList: Route<RequestData, List> = {
  url: "/lists/:id",
  method: "PATCH",
  config: { permissions: ["update:user_lists"], errorReasons },
  schema: schemaRoute,
  handler,
};

export default updateList;
