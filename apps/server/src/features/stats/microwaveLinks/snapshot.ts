import { microwaveLinkSnapshotCounts } from "@openbts/drizzle";
import type { MicrowaveLinkStatisticsDimension } from "@openbts/shared/contract";
import { calculateDistance } from "@openbts/shared/geo";
import {
  type GroupedMicrowaveLink,
  type MicrowaveLinkDirection,
  calculateLinkDirectionalSpeeds,
  getMicrowaveLinkBandBucket,
  getMicrowaveLinkCapacityBucket,
  getMicrowaveLinkLengthBucket,
  getMicrowaveLinkTypeBucket,
  getMicrowaveLinkVendor,
  groupMicrowaveLinks,
} from "@openbts/shared/microwaveLinkUtils";
import { createSelectSchema } from "drizzle-orm/zod";
import type { z } from "zod/v4";

const countSelectSchema = createSelectSchema(microwaveLinkSnapshotCounts);

type CountRow = z.infer<typeof countSelectSchema>;
type SnapshotLink = GroupedMicrowaveLink<SnapshotLinkDirection>;

export type SnapshotLinkDirection = MicrowaveLinkDirection & { vendor: string | null };
export type MicrowaveLinkSnapshotCount = Omit<CountRow, "snapshotId">;

const DIMENSION_BUCKETS: Record<MicrowaveLinkStatisticsDimension, (link: SnapshotLink, lengthMeters: number) => string | null> = {
  total: () => null,
  band: (link) => getMicrowaveLinkBandBucket(link.directions[0]!.frequencyMhz),
  length: (_link, lengthMeters) => getMicrowaveLinkLengthBucket(lengthMeters),
  type: (link) => getMicrowaveLinkTypeBucket(link.linkType),
  capacity: capacityBucketOf,
  vendor: vendorOf,
};
const DIMENSIONS = Object.entries(DIMENSION_BUCKETS);

function capacityBucketOf(link: SnapshotLink): string | null {
  const { dl, ul } = calculateLinkDirectionalSpeeds(link);
  if (dl === null && ul === null) return null;

  return getMicrowaveLinkCapacityBucket(Math.max(dl ?? 0, ul ?? 0));
}

function vendorOf(link: SnapshotLink): string | null {
  const counts = new Map<string, number>();
  for (const { vendor } of link.directions) {
    const name = vendor === null ? null : getMicrowaveLinkVendor(vendor);
    if (name !== null) counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  const [mostCommon] = [...counts].sort(([nameA, countA], [nameB, countB]) => countB - countA || nameA.localeCompare(nameB));
  return mostCommon?.[0] ?? null;
}

export function firstDayOfMonth(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

export function buildMicrowaveLinkSnapshot(directions: readonly SnapshotLinkDirection[]): MicrowaveLinkSnapshotCount[] {
  const counts = new Map<string, MicrowaveLinkSnapshotCount>();

  for (const link of groupMicrowaveLinks(directions)) {
    const lengthMeters = calculateDistance(link.a.latitude, link.a.longitude, link.b.latitude, link.b.longitude);
    const licenseeId = link.directions[0]!.licenseeId;

    for (const [dimension, bucketOf] of DIMENSIONS) {
      const bucket = bucketOf(link, lengthMeters);
      const key = JSON.stringify([licenseeId, dimension, bucket]);
      const count = counts.get(key) ?? { licenseeId, dimension, bucket, linksCount: 0, lengthSumMeters: 0 };
      count.linksCount += 1;
      count.lengthSumMeters += lengthMeters;
      counts.set(key, count);
    }
  }

  return [...counts.values()].map((count) => ({ ...count, lengthSumMeters: Math.round(count.lengthSumMeters) }));
}
