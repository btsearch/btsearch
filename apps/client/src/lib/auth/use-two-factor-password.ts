import { useAuth, useAuthPlugin, useListAccounts } from "@better-auth-ui/react";

import { twoFactorPlugin } from "./two-factor-plugin";

export function useTwoFactorPasswordRequirement() {
  const { authClient } = useAuth();
  const { allowPasswordless } = useAuthPlugin(twoFactorPlugin);
  const { data: accounts, isPending } = useListAccounts(authClient);

  const hasCredentialAccount = accounts?.some((account) => account.providerId === "credential");

  return {
    isPending: allowPasswordless && isPending,
    requiresPassword: !allowPasswordless || isPending || Boolean(hasCredentialAccount),
  };
}
