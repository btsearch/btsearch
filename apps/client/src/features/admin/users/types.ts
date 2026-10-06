import type { UserAccount, UserRole, UserSort } from "@openbts/shared/contract";

import type { SessionDevice } from "@/features/settings/queries";

export type {
  AuditOperation,
  Country,
  GrantRole,
  ProfileVisibility,
  Region as CountryRegion,
  RoleGrant,
  RoleGrantCreate,
  UserAccount,
  UserRef,
  UserRole,
  UserSort,
} from "@openbts/shared/contract";
export type { SessionDevice } from "@/features/settings/queries";

export type NamedUserRef = {
  id: string;
  username: string | null;
  name: string;
  image: string | null;
};

export type AdminListedUser = NamedUserRef & { account: UserAccount };

export type AdminUser = {
  id: string;
  username: string | null;
  name: string;
  image: string | null;
  email: string;
  isEmailVerified: boolean;
  role: UserRole;
  isBanned: boolean;
  banReason: string | null;
  banExpiresAt: string | null;
  isTwoFactorEnabled: boolean;
  isTwoFactorRequired: boolean;
  locale: string | null;
  bio: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminSession = {
  id: string;
  token: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  impersonatedBy: string | null;
  device: SessionDevice;
};

export type UserListParams = {
  search: string;
  roles: readonly UserRole[];
  isBanned: boolean | null;
  sort: UserSort;
  limit: number;
  offset: number;
};
