import { users } from "@openbts/drizzle";
import { USER_SEARCH_MIN_LENGTH, userListQuerySchema, userListSchema } from "@openbts/shared/contract";
import type { ListedUser, Paging, UserAccount, UserList, UserListQuery, UserRef, UserSort } from "@openbts/shared/contract";
import { type SQL, and, count, ilike, inArray, not, or, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import { hasStaffPermission } from "../../../../features/access/staff.js";
import { containsPattern } from "../../../../features/search/text.js";
import { toUserRole } from "../../../../features/users/profile.js";
import { toUserRef } from "../../../../features/users/userRef.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { type SortColumn, type SortField, createKeyset } from "../../../../lib/keyset.js";

const SORT_COLUMNS: Record<SortField<UserSort>, SortColumn | null> = {
  name: { column: users.name, kind: "text" },
  createdAt: { column: users.createdAt, kind: "instant" },
};

const cursorIdSchema = z.uuid();
const schemaRoute = {
  summary: "Search users",
  description:
    "Returns the users that match your filters, each with their id, username, name and image. " +
    "Editors have to send `q` with at least 2 characters, or `ids`. " +
    "An administrator signed in with a session can also list all users without a filter, search email addresses with `q`, " +
    "filter by `roles` and `isBanned`, and request `include=account`. " +
    "With an OAuth token, an administrator is treated like an editor.",
  querystring: userListQuerySchema,
  response: {
    200: userListSchema,
  },
};
const errorReasons = {
  400:
    "A query parameter or the cursor is invalid. Also returned when `q` is shorter than 2 characters " +
    "and you are not an administrator signed in with a session.",
  403:
    "You do not have permission to search users. Also returned when you send `include=account`, `roles` or `isBanned`, " +
    "or neither `q` nor `ids`, and you are not an administrator signed in with a session.",
};
type ReqQuery = { Querystring: UserListQuery };

function assertOpenToStaff({ q, ids, roles, isBanned, include }: UserListQuery): void {
  if (include?.includes("account") || roles !== undefined || isBanned !== undefined) {
    throw new ErrorResponse("INSUFFICIENT_PERMISSIONS", { message: "include=account, roles and isBanned need an admin's session" });
  }
  if (q !== undefined && q.length < USER_SEARCH_MIN_LENGTH) {
    throw new ErrorResponse("INVALID_QUERY", { message: `q needs at least ${USER_SEARCH_MIN_LENGTH} characters` });
  }
  if (q === undefined && ids === undefined) {
    throw new ErrorResponse("INSUFFICIENT_PERMISSIONS", { message: "Without q or ids the list needs an admin's session" });
  }
}

function matchesSearch(q: string, searchesEmail: boolean): SQL | undefined {
  const like = containsPattern(q);
  return or(ilike(users.username, like), ilike(users.name, like), searchesEmail ? ilike(users.email, like) : undefined);
}

function banInForce(): SQL {
  return sql`(${users.banned} IS TRUE AND (${users.banExpires} IS NULL OR ${users.banExpires} > now()))`;
}

function bannedIs(isBanned: boolean): SQL {
  return isBanned ? banInForce() : not(banInForce());
}

async function loadAccounts(userIds: string[]): Promise<Map<string, UserAccount>> {
  const accounts = new Map<string, UserAccount>();
  if (userIds.length === 0) return accounts;

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      emailVerified: users.emailVerified,
      role: users.role,
      banned: users.banned,
      banReason: users.banReason,
      banExpires: users.banExpires,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(inArray(users.id, userIds));
  const now = new Date();
  for (const row of rows) {
    accounts.set(row.id, {
      email: row.email,
      isEmailVerified: row.emailVerified,
      role: toUserRole(row.role),
      isBanned: row.banned === true && (row.banExpires === null || row.banExpires > now),
      banReason: row.banReason,
      banExpiresAt: row.banExpires?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    });
  }
  return accounts;
}

function toListedUser(user: UserRef, account?: UserAccount): ListedUser {
  const listed: ListedUser = { ...user };
  if (account) listed.account = account;
  return listed;
}

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<UserList>>) {
  const { q, ids, roles, isBanned, include, sort, limit, cursor, offset, includeTotal } = req.query;
  if (!req.userSession?.user?.id) throw new ErrorResponse("UNAUTHORIZED");

  const isAdmin = await hasStaffPermission(req, { user: ["list"] });
  if (!isAdmin) assertOpenToStaff(req.query);

  const filters = and(
    q ? matchesSearch(q, isAdmin) : undefined,
    ids ? inArray(users.id, ids) : undefined,
    roles ? inArray(users.role, roles) : undefined,
    isBanned === undefined ? undefined : bannedIs(isBanned),
  );
  const keyset = createKeyset(sort, users.id, SORT_COLUMNS, cursor, cursorIdSchema);

  const [rows, totals] = await Promise.all([
    db
      .select({ id: users.id, username: users.username, name: users.name, image: users.image, key: keyset.key })
      .from(users)
      .where(and(filters, keyset.after))
      .orderBy(...keyset.orderBy)
      .limit(limit + 1)
      .offset(offset ?? 0),
    includeTotal ? db.select({ total: count() }).from(users).where(filters) : null,
  ]);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  const paging: Paging = { limit, nextCursor: rows.length > limit && last ? keyset.cursorAfter({ id: last.id, key: last.key }) : null };
  if (totals) paging.total = totals[0]?.total ?? 0;

  const accounts = include?.includes("account") ? await loadAccounts(page.map((row) => row.id)) : null;

  return res.send({ data: page.map((row) => toListedUser(toUserRef(row), accounts?.get(row.id))), paging });
}

const getUsers: Route<ReqQuery, UserList> = {
  url: "/users",
  method: "GET",
  config: { permissions: ["search:user"], errorReasons },
  schema: schemaRoute,
  handler,
};

export default getUsers;
