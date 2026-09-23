import type { AuthPluginComponents, AuthPlugin as AuthPluginPrimitive } from "@better-auth-ui/react";

declare module "@better-auth-ui/core" {
  interface AuthPluginRegister {
    shadcn: AuthPlugin;
  }
}

export type AuthViewProps = {
  className?: string;
  socialLayout?: "auto" | "horizontal" | "vertical" | "grid";
  socialPosition?: "top" | "bottom";
};

export type SettingsViewProps = {
  className?: string;
};

export type AuthPlugin = AuthPluginPrimitive<AuthPluginComponents, AuthViewProps, SettingsViewProps>;
