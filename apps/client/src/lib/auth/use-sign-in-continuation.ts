import { useAuth } from "@better-auth-ui/react";
import { useCallback } from "react";

import { TWO_FACTOR_PLUGIN_ID, isTwoFactorRedirect, storeTwoFactorMethods } from "./two-factor-methods";

export function useSignInContinuation() {
  const { basePaths, navigate, plugins, redirectTo } = useAuth();

  const twoFactorPath = plugins.find((plugin) => plugin.id === TWO_FACTOR_PLUGIN_ID)?.viewPaths?.auth?.twoFactor;

  return useCallback(
    (data: unknown) => {
      if (twoFactorPath && isTwoFactorRedirect(data)) {
        storeTwoFactorMethods(data.twoFactorMethods);

        navigate({
          to: `${basePaths.auth}/${twoFactorPath}?redirectTo=${encodeURIComponent(redirectTo)}`,
        });
        return;
      }

      navigate({ to: redirectTo });
    },
    [basePaths.auth, navigate, redirectTo, twoFactorPath],
  );
}
