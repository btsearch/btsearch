import { stationComments, stations, users } from "@openbts/drizzle";
import type { Comment, CommentInclude } from "@openbts/shared/contract";
import { eq, inArray } from "drizzle-orm";

import db from "../../database/psql.js";
import { serializeStations } from "../stations/read.js";
import { type UserRefViewer, toPublicUserRef } from "../users/userRef.js";

const commentColumns = {
  id: stationComments.id,
  stationId: stationComments.station_id,
  content: stationComments.content,
  status: stationComments.status,
  attachments: stationComments.attachments,
  createdAt: stationComments.createdAt,
  updatedAt: stationComments.updatedAt,
  authorId: users.id,
  authorUsername: users.username,
  authorName: users.name,
  authorImage: users.image,
  authorVisibility: users.profileVisibility,
};

export type CommentViewRow = {
  id: string;
  stationId: number;
  content: string;
  status: "pending" | "approved";
  attachments: { uuid: string; type: string }[] | null;
  createdAt: Date;
  updatedAt: Date;
  authorId: string;
  authorUsername: string | null;
  authorName: string | null;
  authorImage: string | null;
  authorVisibility: string;
};

export function selectComments() {
  return db.select(commentColumns).from(stationComments).innerJoin(users, eq(users.id, stationComments.user_id));
}

export async function findCommentViewRow(commentId: string): Promise<CommentViewRow | undefined> {
  const [row] = await selectComments().where(eq(stationComments.id, commentId)).limit(1);
  return row;
}

export async function serializeComments(
  rows: readonly CommentViewRow[],
  viewer: UserRefViewer,
  include: readonly CommentInclude[] = [],
): Promise<Comment[]> {
  const stationIds = [...new Set(rows.map((row) => row.stationId))];
  const wantsLocation = include.includes("station.location");
  const wantsStation = wantsLocation || include.includes("station");
  const stationRows = wantsStation && stationIds.length > 0 ? await db.select().from(stations).where(inArray(stations.id, stationIds)) : [];
  const listedStations = await serializeStations(stationRows, wantsLocation ? ["location"] : []);
  const stationsById = new Map(listedStations.map((station) => [station.id, station]));

  return rows.map((row) => {
    const comment: Comment = {
      id: row.id,
      stationId: row.stationId,
      content: row.content,
      status: row.status,
      attachments: (row.attachments ?? []).map((attachment) => ({ id: attachment.uuid, url: `/uploads/${attachment.uuid}.webp` })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      author: toPublicUserRef(
        {
          id: row.authorId,
          username: row.authorUsername,
          name: row.authorName,
          image: row.authorImage,
          profileVisibility: row.authorVisibility,
        },
        viewer,
      ),
    };
    const station = stationsById.get(row.stationId);
    if (station) comment.station = station;
    return comment;
  });
}
