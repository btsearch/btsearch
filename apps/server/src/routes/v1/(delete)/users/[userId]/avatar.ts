import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../errors.js";
import { deleteAvatarFile } from "../../../../../features/users/avatarFile.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  params: z.object({ userId: z.string() }),
  response: {
    200: z.object({ data: z.null() }),
  },
};

type Params = { Params: { userId: string } };

async function handler(req: FastifyRequest<Params>, res: ReplyPayload<JSONBody<null>>) {
  const { userId } = req.params;

  const targetUser = await db.query.users.findFirst({
    where: { id: userId },
    columns: { image: true },
  });

  if (!targetUser) throw new ErrorResponse("NOT_FOUND");
  if (targetUser.image) await deleteAvatarFile(userId, targetUser.image);

  return res.send({ data: null });
}

const deleteUserAvatar: Route<Params, null> = {
  url: "/users/:userId/avatar",
  method: "DELETE",
  config: { permissions: ["delete-avatar:user"] },
  schema: schemaRoute,
  handler,
};

export default deleteUserAvatar;
