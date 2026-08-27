import { apiKeyClient } from "@better-auth/api-key/client";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { passkeyClient } from "@better-auth/passkey/client";
import { adminClient, lastLoginMethodClient, multiSessionClient, twoFactorClient, usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { API_BASE } from "@/lib/api";

export const authClient = createAuthClient({
  baseURL: API_BASE.replace(/\/api\/v1$/, ""),
  basePath: "/api/v1/auth",
  plugins: [
    adminClient(),
    apiKeyClient(),
    lastLoginMethodClient(),
    multiSessionClient(),
    twoFactorClient({
      onTwoFactorRedirect() {
        window.dispatchEvent(new CustomEvent("two-factor-redirect"));
      },
    }),
    usernameClient(),
    passkeyClient(),
    oauthProviderClient(),
  ],
});
