import { attachments, brands, users } from "@openbts/drizzle";
import { and, eq, ne } from "drizzle-orm";
import fs from "node:fs/promises";
import path from "node:path";

import db from "../../database/psql.js";
import { logger } from "../../utils/logger.js";
import { UPLOAD_DIR } from "../../utils/photoFiles.js";

const AVATAR_FILE_NAME = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.webp$/;

async function isFileInUse(userId: string, image: string, fileUuid: string): Promise<boolean> {
  const [[photo], [otherUser], [brand]] = await Promise.all([
    db.select({ id: attachments.id }).from(attachments).where(eq(attachments.uuid, fileUuid)).limit(1),
    db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.image, image), ne(users.id, userId)))
      .limit(1),
    db.select({ id: brands.id }).from(brands).where(eq(brands.logoFile, image)).limit(1),
  ]);
  return Boolean(photo || otherUser || brand);
}

export async function deleteAvatarFile(userId: string, image: string): Promise<void> {
  const fileUuid = AVATAR_FILE_NAME.exec(image)?.[1];
  if (fileUuid === undefined) return;

  try {
    if (await isFileInUse(userId, image, fileUuid)) return;
  } catch (error) {
    logger.error("avatar.delete.check", { error });
    return;
  }

  await fs.unlink(path.join(UPLOAD_DIR, image)).catch(() => undefined);
}
