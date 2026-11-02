import type { GenericEndpointContext } from "better-auth";
import { APIError, isAPIError } from "better-auth/api";

type HookCtx = GenericEndpointContext;

const EMAIL_SIGN_IN_PATH = "/sign-in/email";
const USERNAME_SIGN_IN_PATH = "/sign-in/username";

export function isPendingApproval(user: object | null | undefined): boolean {
  return user !== null && user !== undefined && "pendingApproval" in user && user.pendingApproval === true;
}

function pendingApprovalError(): APIError {
  return new APIError("FORBIDDEN", { code: "ACCOUNT_PENDING_APPROVAL", message: "Your account is waiting for an administrator's approval" });
}

async function findPasswordSignInUser(ctx: HookCtx): Promise<object | null | undefined> {
  const { email, username } = ctx.body ?? {};
  if (ctx.path === EMAIL_SIGN_IN_PATH && typeof email === "string") return (await ctx.context.internalAdapter.findUserByEmail(email))?.user;
  if (ctx.path === USERNAME_SIGN_IN_PATH && typeof username === "string") {
    return ctx.context.adapter.findOne({ model: "user", where: [{ field: "username", value: username.toLowerCase() }] });
  }
  return null;
}

export async function assertSignUpApproved(userId: string, ctx: HookCtx | null): Promise<void> {
  if (!ctx) return;

  if (isPendingApproval(await ctx.context.internalAdapter.findUserById(userId))) throw pendingApprovalError();
}

export async function refusePendingPasswordSignIn(ctx: HookCtx, returned: unknown): Promise<void> {
  if (!isAPIError(returned) || returned.body?.code !== "EMAIL_NOT_VERIFIED") return;

  if (isPendingApproval(await findPasswordSignInUser(ctx))) throw pendingApprovalError();
}
