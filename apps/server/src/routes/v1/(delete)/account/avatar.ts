import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import { deleteAvatarFile } from "../../../../features/users/avatarFile.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  response: {
    200: z.object({ data: z.null() }),
  },
};

async function handler(req: FastifyRequest, res: ReplyPayload<JSONBody<null>>) {
  const session = req.userSession;
  if (!session?.user) throw new ErrorResponse("UNAUTHORIZED");
  const userId = session.user.id;

  const currentUser = await db.query.users.findFirst({
    where: { id: userId },
    columns: { image: true },
  });

  if (currentUser?.image) await deleteAvatarFile(userId, currentUser.image);

  return res.send({ data: null });
}

const deleteAvatar: Route<Record<string, never>, null> = {
  url: "/account/avatar",
  method: "DELETE",
  schema: schemaRoute,
  handler,
};

export default deleteAvatar;
