import i18next from "i18next";
import { toast } from "sonner";

import { readAuthError, showSettingsError } from "@/features/settings/authErrors";
import { authClient } from "@/lib/auth/client";

const WITHOUT_SESSION_REFETCH = { disableSignal: true };

export async function startImpersonation(userId: string): Promise<void> {
  const { error } = await authClient.admin.impersonateUser({ userId, fetchOptions: WITHOUT_SESSION_REFETCH });
  if (error) throw error;
}

export async function stopImpersonation(): Promise<void> {
  const { error } = await authClient.admin.stopImpersonating({ fetchOptions: WITHOUT_SESSION_REFETCH });
  if (error) throw error;
}

export function showImpersonationError(error: unknown): void {
  const { code } = readAuthError(error);
  if (code === "YOU_CANNOT_IMPERSONATE_ADMINS") {
    toast.error(i18next.t("common:impersonation.unavailable.admin"));
    return;
  }
  if (code === "BANNED_USER") {
    toast.error(i18next.t("common:impersonation.unavailable.banned"));
    return;
  }
  showSettingsError(error);
}
