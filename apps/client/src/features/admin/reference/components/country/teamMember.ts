import type { GrantRole, TeamGrant } from "../../types";
import { getPickerUserHandle, getPickerUserName, toPickerAvatarUser } from "@/features/admin/users/picker/pickerUser";

export type TeamMember = {
  userId: string;
  name: string;
  handle: string | null;
  avatar: { name: string; image: string | null };
  isNamed: boolean;
  hasAccount: boolean;
};

export type TeamEntry = {
  grant: TeamGrant;
  member: TeamMember;
};

const SHORT_ID_LENGTH = 8;
const UNKNOWN_AVATAR = { name: "?", image: null };

function toTeamMember(grant: TeamGrant, unknownUserName: string): TeamMember {
  const { user, userId } = grant;
  const name = user === null ? null : getPickerUserName(user);
  if (user === null || name === null) {
    return {
      userId,
      name: unknownUserName,
      handle: userId.slice(0, SHORT_ID_LENGTH),
      avatar: UNKNOWN_AVATAR,
      isNamed: false,
      hasAccount: user !== null,
    };
  }

  return { userId, name, handle: getPickerUserHandle(user), avatar: toPickerAvatarUser(user), isNamed: true, hasAccount: true };
}

function compareEntries(left: TeamEntry, right: TeamEntry, language: string): number {
  if (left.member.isNamed !== right.member.isNamed) return left.member.isNamed ? -1 : 1;
  return left.member.name.localeCompare(right.member.name, language) || left.member.userId.localeCompare(right.member.userId);
}

export function listTeamEntries(grants: readonly TeamGrant[], role: GrantRole, unknownUserName: string, language: string): TeamEntry[] {
  return grants
    .filter((grant) => grant.role === role)
    .map((grant) => ({ grant, member: toTeamMember(grant, unknownUserName) }))
    .sort((left, right) => compareEntries(left, right, language));
}
