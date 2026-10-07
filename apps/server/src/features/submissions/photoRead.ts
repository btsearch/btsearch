import { attachments, submissionPhotos, users } from "@openbts/drizzle";
import type { SubmissionPhoto } from "@openbts/shared/contract";
import { and, asc, eq, inArray } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { z } from "zod/v4";

import db from "../../database/psql.js";
import { photoUrls, toPhotoDetails } from "../photos/read.js";
import type { UserRefViewer } from "../users/userRef.js";

const submissionPhotoSelectSchema = createSelectSchema(submissionPhotos);

export type SubmissionPhotoRow = z.infer<typeof submissionPhotoSelectSchema>;

export async function findSubmissionPhoto(submissionId: string, fileId: string): Promise<SubmissionPhotoRow | undefined> {
  const [row] = await db
    .select({ photo: submissionPhotos })
    .from(submissionPhotos)
    .innerJoin(attachments, eq(submissionPhotos.attachment_id, attachments.id))
    .where(and(eq(submissionPhotos.submission_id, submissionId), eq(attachments.uuid, fileId)))
    .limit(1);
  return row?.photo;
}

export async function listSubmissionPhotos(submissionId: string, viewer: UserRefViewer, ids?: readonly number[]): Promise<SubmissionPhoto[]> {
  if (ids?.length === 0) return [];

  const rows = await db
    .select({
      fileId: attachments.uuid,
      width: attachments.width,
      height: attachments.height,
      hasThumb: attachments.has_thumb,
      hasFull: attachments.has_full,
      note: submissionPhotos.note,
      takenAt: submissionPhotos.taken_at,
      isMain: submissionPhotos.is_main,
      createdAt: submissionPhotos.createdAt,
      authorId: users.id,
      authorUsername: users.username,
      authorName: users.name,
      authorImage: users.image,
      authorVisibility: users.profileVisibility,
    })
    .from(submissionPhotos)
    .innerJoin(attachments, eq(submissionPhotos.attachment_id, attachments.id))
    .leftJoin(users, eq(attachments.author_id, users.id))
    .where(and(eq(submissionPhotos.submission_id, submissionId), ids ? inArray(submissionPhotos.id, [...ids]) : undefined))
    .orderBy(asc(submissionPhotos.createdAt), asc(submissionPhotos.id));

  return rows.map((row) => ({
    id: row.fileId,
    urls: photoUrls(row.fileId, row.hasThumb, row.hasFull),
    ...toPhotoDetails(row, viewer),
    isMain: row.isMain,
  }));
}
