import { attachments, brands, locationPhotos, stationComments, submissionPhotos, users } from "@openbts/drizzle";
import { sql as connection, db } from "@openbts/drizzle/db";
import { type SQL, and, asc, eq, isNotNull, lt, notExists, sql } from "drizzle-orm";
import fs from "node:fs/promises";
import path from "node:path";

import { UPLOAD_DIR } from "../utils/photoFiles.js";

type OrphanFile = { name: string; size: number; writtenAt: Date };

const APPLY = process.argv.includes("--apply");
const UPLOAD_FILE_NAME = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(?:webp|thumb\.webp|full\.avif)$/;
const MIN_AGE_MS = 24 * 60 * 60 * 1000;
const ORPHAN_ATTACHMENT_COLUMNS = { id: attachments.id, uuid: attachments.uuid, name: attachments.name, createdAt: attachments.createdAt };

function isOrphanAttachment(createdBefore: Date): SQL | undefined {
  return and(
    lt(attachments.createdAt, createdBefore),
    notExists(db.select({ id: submissionPhotos.id }).from(submissionPhotos).where(eq(submissionPhotos.attachment_id, attachments.id))),
    notExists(db.select({ id: locationPhotos.id }).from(locationPhotos).where(eq(locationPhotos.attachment_id, attachments.id))),
    notExists(
      db
        .select({ id: stationComments.id })
        .from(stationComments)
        .where(sql`${stationComments.attachments} @> jsonb_build_array(jsonb_build_object('uuid', ${attachments.uuid}::text))`),
    ),
  );
}

async function findOldFile(name: string, writtenBefore: Date): Promise<OrphanFile | null> {
  const stats = await fs.stat(path.join(UPLOAD_DIR, name)).catch(() => null);
  if (stats === null || !stats.isFile() || stats.mtimeMs >= writtenBefore.getTime()) return null;
  return { name, size: stats.size, writtenAt: stats.mtime };
}

async function main() {
  const cutoff = new Date(Date.now() - MIN_AGE_MS);
  const fileNames = (await fs.readdir(UPLOAD_DIR)).filter((name) => UPLOAD_FILE_NAME.test(name));

  const isOrphan = isOrphanAttachment(cutoff);
  const orphanRows = APPLY
    ? await db.delete(attachments).where(isOrphan).returning(ORPHAN_ATTACHMENT_COLUMNS)
    : await db.select(ORPHAN_ATTACHMENT_COLUMNS).from(attachments).where(isOrphan).orderBy(asc(attachments.id));
  for (const row of orphanRows) {
    console.log(`attachment #${row.id} ${row.uuid} (${row.name}, added ${row.createdAt.toISOString()}): nothing points at it`);
  }

  const [attachmentRows, commentRows, avatarRows, logoRows] = await Promise.all([
    db.select({ uuid: attachments.uuid }).from(attachments),
    db.select({ images: stationComments.attachments }).from(stationComments).where(isNotNull(stationComments.attachments)),
    db.select({ file: users.image }).from(users).where(isNotNull(users.image)),
    db.select({ file: brands.logoFile }).from(brands).where(isNotNull(brands.logoFile)),
  ]);
  const claimedUuids = new Set(attachmentRows.map(({ uuid }) => uuid));
  for (const { uuid } of orphanRows) claimedUuids.delete(uuid);
  for (const image of commentRows.flatMap((comment) => comment.images ?? [])) claimedUuids.add(image.uuid);
  const namedFiles = new Set([...avatarRows, ...logoRows].map(({ file }) => file));

  const unclaimedNames = fileNames.filter((name) => {
    const uuid = UPLOAD_FILE_NAME.exec(name)?.[1];
    return uuid !== undefined && !claimedUuids.has(uuid) && !namedFiles.has(name);
  });
  const oldFiles = await Promise.all(unclaimedNames.map((name) => findOldFile(name, cutoff)));
  const orphanFiles = oldFiles.filter((file): file is OrphanFile => file !== null);
  for (const file of orphanFiles) {
    console.log(`file ${file.name} (${file.size} bytes, written ${file.writtenAt.toISOString()}): no attachment and no user names it`);
  }

  const megabytes = (orphanFiles.reduce((total, file) => total + file.size, 0) / 1024 / 1024).toFixed(1);
  const found = `${orphanRows.length} attachment rows and ${orphanFiles.length} of ${fileNames.length} photo and avatar files (${megabytes} MB)`;
  if (!APPLY) {
    console.log(`would remove ${found}; run again with --apply to remove them`);
    return;
  }

  const removals = await Promise.allSettled(orphanFiles.map((file) => fs.unlink(path.join(UPLOAD_DIR, file.name))));
  const failed = removals.filter(({ status }) => status === "rejected").length;
  console.log(`removed ${found}`);
  if (failed > 0) {
    console.error(`${failed} of those files could not be removed`);
    process.exitCode = 1;
  }
}

main()
  .catch((error: unknown) => {
    console.error("scan failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await connection.end();
    process.exit();
  });
