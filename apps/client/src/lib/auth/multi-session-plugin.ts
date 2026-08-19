import { createAuthPlugin } from "@better-auth-ui/core";
import { type MultiSessionPluginOptions, multiSessionPlugin as coreMultiSessionPlugin } from "@better-auth-ui/core/plugins/multi-session";

import { ManageAccounts } from "@/components/auth/multi-session/manage-accounts";
import { SwitchAccountSubmenu } from "@/components/auth/multi-session/switch-account-submenu";

export const multiSessionPlugin = createAuthPlugin(coreMultiSessionPlugin.id, (options: MultiSessionPluginOptions = {}) => ({
  ...coreMultiSessionPlugin(options),
  accountCards: [ManageAccounts],
  userMenuItems: [SwitchAccountSubmenu],
}));
