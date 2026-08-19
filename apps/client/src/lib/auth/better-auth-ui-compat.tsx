import { type AuthClient, getProviderName as getBuiltInProviderName } from "@better-auth-ui/core";
import { providerIcons } from "@better-auth-ui/react";
import type { passkeyClient } from "@better-auth/passkey/client";
import type { multiSessionClient, usernameClient } from "better-auth/client/plugins";
import type { SocialProvider } from "better-auth/social-providers";
import { type ComponentPropsWithRef, type ReactElement, type ReactNode, cloneElement, createElement, isValidElement } from "react";

/**
 * TODO: to be removed when better-auth-ui releases a version that has correct exports
 */

export type CustomSocialProvider = {
  id: string;
  label: string;
  icon?: ReactNode;
};

export type AuthSocialProvider = SocialProvider | CustomSocialProvider;

export type MultiSessionAuthClient = AuthClient<{ plugins: [ReturnType<typeof multiSessionClient>] }>;
export type PasskeyAuthClient = AuthClient<{ plugins: [ReturnType<typeof passkeyClient>] }>;
export type UsernameAuthClient = AuthClient<{ plugins: [ReturnType<typeof usernameClient<{ displayUsername: true }>>] }>;

export const getProviderId = (provider: AuthSocialProvider) => (typeof provider === "string" ? provider : provider.id);

export const isCustomSocialProvider = (provider: AuthSocialProvider): provider is CustomSocialProvider => typeof provider !== "string";

export function getProviderName(provider: AuthSocialProvider) {
  if (typeof provider !== "string") return provider.label;
  return getBuiltInProviderName(provider);
}

export function renderProviderIcon(provider: AuthSocialProvider, props?: ComponentPropsWithRef<"svg">) {
  if (typeof provider !== "string") {
    if (!isValidElement(provider.icon)) return provider.icon ?? null;
    const icon = provider.icon as ReactElement<ComponentPropsWithRef<"svg">>;
    const className = [icon.props.className, props?.className].filter(Boolean).join(" ");
    return cloneElement(icon, { ...props, className: className || undefined });
  }
  const ProviderIcon = providerIcons[provider as SocialProvider];
  return ProviderIcon ? createElement(ProviderIcon, props) : null;
}
