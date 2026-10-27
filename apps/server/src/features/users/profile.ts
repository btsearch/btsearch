import { stationComments, stations, users } from "@openbts/drizzle";
import { USER_ROLES } from "@openbts/shared/contract";
import type { UserCommentSummary, UserContact, UserProfile, UserRole } from "@openbts/shared/contract";
import { type SQL, and, asc, count, desc, eq } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify";
import { z } from "zod/v4";

import db from "../../database/psql.js";
import { ErrorResponse } from "../../errors.js";
import { getRuntimeSettings } from "../../lib/runtimeSettings.js";
import { loadHiddenCountryCodes } from "../countries/visibility.js";
import { countUserPhotos } from "../photos/read.js";
import { stationAreaConditions } from "../stations/read.js";
import { loadUserRefViewer } from "./userRef.js";

const userSelectSchema = createSelectSchema(users, {
  contactInfo: z.object({ instagram: z.string().optional(), facebook: z.string().optional(), email: z.string().optional() }).nullable(),
});

type UserRow = z.infer<typeof userSelectSchema>;
export type ProfileUser = Pick<
  UserRow,
  "id" | "username" | "name" | "image" | "bio" | "role" | "contactInfo" | "profileVisibility" | "hunterListing" | "createdAt"
> & { hunterRegions: { regionId: number }[] };

const INSTAGRAM_HANDLE_PREFIX = /^@/;

export function normalizeContact(contactInfo: UserRow["contactInfo"]): UserContact | null {
  const instagram = contactInfo?.instagram?.trim().replace(INSTAGRAM_HANDLE_PREFIX, "") || null;
  const facebookUrl = contactInfo?.facebook?.trim() ?? "";
  const facebook = facebookUrl.startsWith("https://") ? facebookUrl : null;
  const email = contactInfo?.email?.trim() || null;
  return instagram || facebook || email ? { instagram, facebook, email } : null;
}

export function toUserRole(storedRole: string): UserRole {
  return USER_ROLES.find((candidate) => candidate === storedRole) ?? "user";
}

export async function findProfileUser(username: string): Promise<ProfileUser> {
  const user = await db.query.users.findFirst({
    where: { username: username.toLowerCase() },
    columns: {
      id: true,
      username: true,
      name: true,
      image: true,
      bio: true,
      role: true,
      contactInfo: true,
      profileVisibility: true,
      hunterListing: true,
      createdAt: true,
    },
    with: { hunterRegions: { columns: { regionId: true }, orderBy: { regionId: "asc" } } },
  });
  if (!user) throw new ErrorResponse("NOT_FOUND");
  return user;
}

export function isRestrictedProfile(user: ProfileUser, viewerId: string | null): boolean {
  return user.profileVisibility !== "public" && viewerId !== user.id;
}

export function profileCommentConditions(userId: string, hiddenCodes: readonly string[]): SQL[] {
  return [eq(stationComments.user_id, userId), eq(stationComments.status, "approved"), ...stationAreaConditions({}, hiddenCodes)];
}

async function loadCommentSummary(req: FastifyRequest, userId: string): Promise<UserCommentSummary> {
  const operatorCounts = await db
    .select({ operatorId: stations.operator_id, count: count() })
    .from(stationComments)
    .innerJoin(stations, eq(stations.id, stationComments.station_id))
    .where(and(...profileCommentConditions(userId, await loadHiddenCountryCodes(req))))
    .groupBy(stations.operator_id)
    .orderBy(desc(count()), asc(stations.operator_id));

  return { total: operatorCounts.reduce((total, row) => total + row.count, 0), operatorCounts };
}

async function loadPhotoCount(req: FastifyRequest, userId: string): Promise<number> {
  return countUserPhotos(userId, await loadHiddenCountryCodes(req));
}

export async function loadUserProfile(req: FastifyRequest, username: string): Promise<UserProfile> {
  const [user, viewer] = await Promise.all([findProfileUser(username), loadUserRefViewer(req)]);

  const isRestricted = isRestrictedProfile(user, viewer.userId);
  const showsIdentity = !isRestricted || viewer.isStaff;
  const role = toUserRole(user.role);
  const contact = isRestricted ? null : normalizeContact(user.contactInfo);
  const isSignedIn = req.userSession?.user?.id !== undefined;
  const showsContact = isSignedIn || viewer.userId === user.id;
  const hunterRegionIds = user.hunterRegions.map(({ regionId }) => regionId);
  const isHunter = user.profileVisibility === "public" && user.hunterListing && hunterRegionIds.length > 0;
  const showsComments = !isRestricted && getRuntimeSettings().enableStationComments;
  const [comments, photoCount] = await Promise.all([
    showsComments ? loadCommentSummary(req, user.id) : null,
    isRestricted ? null : loadPhotoCount(req, user.id),
  ]);

  return {
    id: user.id,
    username: user.username,
    name: showsIdentity ? user.name : null,
    image: user.image,
    bio: isRestricted ? null : user.bio,
    role: showsIdentity ? role : null,
    visibility: user.profileVisibility === "public" ? "public" : "private",
    isRestricted,
    contact: showsContact ? contact : null,
    isContactHidden: !showsContact && contact !== null,
    hunterRegionIds: isHunter ? hunterRegionIds : null,
    comments,
    photoCount,
    createdAt: user.createdAt.toISOString(),
  };
}
