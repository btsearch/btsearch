import { pushSubscriptions } from "@openbts/drizzle";
import type { PushSubscription, PushSubscriptionCreate, PushTopics } from "@openbts/shared/contract";
import { and, desc, eq, ne, notInArray, sql } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import { z } from "zod/v4";

import db from "../../database/psql.js";

const pushSubscriptionSelectSchema = createSelectSchema(pushSubscriptions, {
  preferences: z.object({
    ukeUpdates: z.boolean().optional(),
    submissionUpdates: z.boolean().optional(),
    newSubmission: z.boolean().optional(),
    stationWatches: z.boolean().optional(),
  }),
});

type PushSubscriptionRow = z.infer<typeof pushSubscriptionSelectSchema>;

const MAX_PUSH_SUBSCRIPTIONS = 20;

export function toPushSubscription(row: PushSubscriptionRow): PushSubscription {
  const { preferences } = row;

  return {
    id: row.id,
    topics: {
      officialDataUpdates: preferences.ukeUpdates === true,
      submissionUpdates: preferences.submissionUpdates !== false,
      newSubmissions: preferences.newSubmission !== false,
      stationWatches: preferences.stationWatches !== false,
    },
    createdAt: row.createdAt.toISOString(),
  };
}

export function toStoredPreferences(topics: Partial<PushTopics>): PushSubscriptionRow["preferences"] {
  const preferences: PushSubscriptionRow["preferences"] = {};
  if (topics.officialDataUpdates !== undefined) preferences.ukeUpdates = topics.officialDataUpdates;
  if (topics.submissionUpdates !== undefined) preferences.submissionUpdates = topics.submissionUpdates;
  if (topics.newSubmissions !== undefined) preferences.newSubmission = topics.newSubmissions;
  if (topics.stationWatches !== undefined) preferences.stationWatches = topics.stationWatches;
  return preferences;
}

export async function savePushSubscription(userId: string, { endpoint, keys }: PushSubscriptionCreate): Promise<PushSubscriptionRow | undefined> {
  const ownPreferences = sql`CASE WHEN ${pushSubscriptions.userId} = ${userId} THEN ${pushSubscriptions.preferences} ELSE '{}'::jsonb END`;
  const [saved] = await db
    .insert(pushSubscriptions)
    .values({ userId, endpoint, p256dh: keys.p256dh, auth: keys.auth })
    .onConflictDoUpdate({
      target: [pushSubscriptions.endpoint],
      set: { userId, p256dh: keys.p256dh, auth: keys.auth, preferences: ownPreferences },
    })
    .returning();
  if (!saved) return undefined;

  const newest = db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
    .orderBy(desc(pushSubscriptions.createdAt))
    .limit(MAX_PUSH_SUBSCRIPTIONS);
  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), ne(pushSubscriptions.id, saved.id), notInArray(pushSubscriptions.id, newest)));

  return saved;
}
