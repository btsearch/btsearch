import type { TFunction } from "i18next";

const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 25;
const RESERVED_USERNAMES = new Set(["admin", "administrator", "mod", "moderator"]);
const DISALLOWED_USERNAME_CHARACTERS = /[\s@/!#$%^&*()+={}[\]|\\:;"'<>,?]/;

type UsernameProblem = "length" | "invalid" | "reserved" | "taken";

export function getUsernameProblem(username: string, takenUsername: string | null): UsernameProblem | null {
  if (username.length < USERNAME_MIN_LENGTH || username.length > USERNAME_MAX_LENGTH) return "length";
  if (DISALLOWED_USERNAME_CHARACTERS.test(username)) return "invalid";
  if (RESERVED_USERNAMES.has(username.toLowerCase())) return "reserved";
  if (takenUsername !== null && takenUsername.toLowerCase() === username.toLowerCase()) return "taken";
  return null;
}

export function getUsernameProblemText(t: TFunction, problem: UsernameProblem): string {
  if (problem === "length") return t("settings:account.username.length", { min: USERNAME_MIN_LENGTH, max: USERNAME_MAX_LENGTH });
  if (problem === "invalid") return t("settings:account.username.invalid");
  if (problem === "reserved") return t("settings:account.username.reserved");
  return t("settings:account.username.taken");
}
