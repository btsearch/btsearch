import { GithubIcon, GoogleIcon } from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

export type SocialProviderId = "google" | "github";

export type SocialProvider = {
  id: SocialProviderId;
  label: string;
  icon: IconSvgElement;
};

export const SOCIAL_PROVIDERS: readonly SocialProvider[] = [
  { id: "google", label: "Google", icon: GoogleIcon },
  { id: "github", label: "GitHub", icon: GithubIcon },
];
