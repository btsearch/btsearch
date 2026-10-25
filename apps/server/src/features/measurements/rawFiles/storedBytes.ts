import { uploads } from "@openbts/drizzle";
import { isNull, sum } from "drizzle-orm";

import db from "../../../database/psql.js";
import redis from "../../../database/redis.js";

const STORED_BYTES_KEY = "measurements:stored-bytes";
const STORED_BYTES_CACHE_SECONDS = 300;

export async function readStoredBytes(): Promise<number> {
  const cached = await redis.get(STORED_BYTES_KEY);
  if (cached !== null) return Number(cached);

  const [stored] = await db
    .select({ bytes: sum(uploads.bodyBytes) })
    .from(uploads)
    .where(isNull(uploads.objectDeletedAt));
  const bytes = Number(stored?.bytes ?? 0);
  await redis.setEx(STORED_BYTES_KEY, STORED_BYTES_CACHE_SECONDS, String(bytes));
  return bytes;
}
