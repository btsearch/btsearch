import { createAuthPlugin } from "@better-auth-ui/core";
import { type UsernamePluginOptions, usernamePlugin as coreUsernamePlugin } from "@better-auth-ui/core/plugins/username";

import { SignInUsername } from "@/components/auth/username/sign-in-username";
import { UsernameField } from "@/components/auth/username/username-field";

export const usernamePlugin = createAuthPlugin(coreUsernamePlugin.id, (options: UsernamePluginOptions = {}) => {
  const core = coreUsernamePlugin(options);

  return {
    ...core,
    additionalFields: core.additionalFields?.map((field) =>
      field.name === "username"
        ? {
            ...field,
            render: UsernameField,
          }
        : field,
    ),
    views: {
      auth: { signIn: SignInUsername },
    },
  };
});
