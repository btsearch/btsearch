import { createAuthPlugin } from "@better-auth-ui/core";
import { type DeleteUserPluginOptions, deleteUserPlugin as coreDeleteUserPlugin } from "@better-auth-ui/core/plugins/delete-user";

import { DangerZone } from "@/components/auth/delete-user/danger-zone";

export const deleteUserPlugin = createAuthPlugin(coreDeleteUserPlugin.id, (options: DeleteUserPluginOptions = {}) => ({
  ...coreDeleteUserPlugin(options),
  securityCards: [DangerZone],
}));
