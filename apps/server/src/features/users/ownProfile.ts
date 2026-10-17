import { hunterRegions, regions, users } from "@openbts/drizzle";
import type { OwnProfile, OwnProfileUpdate } from "@openbts/shared/contract";
import { and, eq, inArray, notInArray } from "drizzle-orm";

import db from "../../database/psql.js";
import { ErrorResponse } from "../../errors.js";

type StoredContact = { instagram?: string; facebook?: string; email?: string };
type ContactChanges = NonNullable<OwnProfileUpdate["contact"]>;
type StoredProfile = {
  bio: string | null;
  contactInfo: StoredContact | null;
  profileVisibility: string;
  hunterListing: boolean;
  hunterRegionIds: number[];
};

const CONTACT_KEYS = ["instagram", "facebook", "email"] as const;
const PROFILE_COLUMNS = { bio: true, contactInfo: true, profileVisibility: true, hunterListing: true } as const;
const HUNTER_REGIONS = { hunterRegions: { columns: { regionId: true }, orderBy: { regionId: "asc" } } } as const;

function toOwnProfile(profile: StoredProfile): OwnProfile {
  const isPublic = profile.profileVisibility === "public";
  return {
    bio: profile.bio,
    contact: {
      instagram: profile.contactInfo?.instagram ?? null,
      facebook: profile.contactInfo?.facebook ?? null,
      email: profile.contactInfo?.email ?? null,
    },
    visibility: isPublic ? "public" : "private",
    isListedAsHunter: isPublic && profile.hunterListing,
    hunterRegionIds: profile.hunterRegionIds,
  };
}

function mergeContact(stored: StoredContact | null, changes: ContactChanges): StoredContact | null {
  const merged: StoredContact = { ...stored };
  for (const key of CONTACT_KEYS) {
    const value = changes[key];
    if (value === null) delete merged[key];
    else if (value !== undefined) merged[key] = value;
  }
  return Object.keys(merged).length > 0 ? merged : null;
}

async function assertSelectableRegions(regionIds: number[], hiddenCountryCodes: string[]): Promise<void> {
  const found = await db
    .select({ id: regions.id })
    .from(regions)
    .where(and(inArray(regions.id, regionIds), notInArray(regions.countryCode, hiddenCountryCodes)));
  if (found.length !== regionIds.length) throw new ErrorResponse("BAD_REQUEST", { message: "A region in hunterRegionIds does not exist" });
}

export async function loadOwnProfile(userId: string): Promise<OwnProfile> {
  const user = await db.query.users.findFirst({ where: { id: userId }, columns: PROFILE_COLUMNS, with: HUNTER_REGIONS });
  if (!user) throw new ErrorResponse("NOT_FOUND");
  return toOwnProfile({ ...user, hunterRegionIds: user.hunterRegions.map(({ regionId }) => regionId) });
}

export async function updateOwnProfile(userId: string, update: OwnProfileUpdate, hiddenCountryCodes: string[]): Promise<OwnProfile> {
  const regionIds = update.hunterRegionIds === undefined ? undefined : [...new Set(update.hunterRegionIds)].sort((a, b) => a - b);
  if (regionIds !== undefined && regionIds.length > 0) await assertSelectableRegions(regionIds, hiddenCountryCodes);

  return db.transaction(async (tx) => {
    const current = await tx.query.users.findFirst({ where: { id: userId }, columns: PROFILE_COLUMNS, with: HUNTER_REGIONS });
    if (!current) throw new ErrorResponse("NOT_FOUND");

    const profileVisibility = update.visibility ?? current.profileVisibility;
    const isPublic = profileVisibility === "public";
    if (update.isListedAsHunter === true && !isPublic)
      throw new ErrorResponse("BAD_REQUEST", { message: "A private profile cannot be listed as a hunter" });

    const next: StoredProfile = {
      bio: update.bio === undefined ? current.bio : update.bio,
      contactInfo: update.contact === undefined ? current.contactInfo : mergeContact(current.contactInfo, update.contact),
      profileVisibility,
      hunterListing: isPublic && (update.isListedAsHunter ?? current.hunterListing),
      hunterRegionIds: regionIds ?? current.hunterRegions.map(({ regionId }) => regionId),
    };
    if (next.hunterListing && next.hunterRegionIds.length === 0)
      throw new ErrorResponse("BAD_REQUEST", { message: "A hunter needs at least one region" });

    await tx
      .update(users)
      .set({ bio: next.bio, contactInfo: next.contactInfo, profileVisibility: next.profileVisibility, hunterListing: next.hunterListing })
      .where(eq(users.id, userId));

    if (regionIds !== undefined) {
      await tx.delete(hunterRegions).where(eq(hunterRegions.userId, userId));
      if (regionIds.length > 0) await tx.insert(hunterRegions).values(regionIds.map((regionId) => ({ userId, regionId })));
    }

    return toOwnProfile(next);
  });
}
