import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { getUserListMembership, getVisibleUserList, userListSelectSchema } from "../../../../utils/userLists.js";

const schemaRoute = {
  params: z.object({
    uuid: z.string(),
  }),
  response: {
    200: z.object({
      data: userListSelectSchema.omit({ created_by: true, stations: true, radiolines: true }).extend({
        stations: z.object({ internal: z.array(z.number()), uke: z.array(z.number()) }),
        radiolines: z.array(z.number()),
      }),
    }),
  },
};

type ReqParams = { Params: { uuid: string } };
type ResponseBody = z.infer<(typeof schemaRoute.response)["200"]>;

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<ResponseBody>>) {
  const list = await getVisibleUserList(req.params.uuid, req.userSession?.user.id);
  const { internal, uke, radiolines } = getUserListMembership(list);

  return res.send({
    data: {
      id: list.id,
      uuid: list.uuid,
      name: list.name,
      description: list.description,
      is_public: list.is_public,
      notificationsEnabled: list.notificationsEnabled,
      stations: { internal, uke },
      radiolines,
      createdAt: list.createdAt,
      updatedAt: list.updatedAt,
    },
  });
}

const getListByUuid: Route<ReqParams, ResponseBody> = {
  url: "/lists/:uuid",
  method: "GET",
  config: { allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getListByUuid;
