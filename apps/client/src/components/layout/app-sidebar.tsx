import { GitBranchIcon, Login01Icon, Settings02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useLocation } from "@tanstack/react-router";
import React, { type ComponentProps, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { AuthDialog } from "@/components/auth/authDialog";
import { LanguageSwitcher } from "@/components/preferences/language-switcher";
import { ThemeToggle } from "@/components/preferences/theme-toggle";
import { GoogleAd } from "@/components/ui/google-ad";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { useSettings } from "@/hooks/useSettings";
import { useWindowControlsOverlay } from "@/hooks/useWindowControlsOverlay";
import { APP_NAME } from "@/lib/api";
import { authClient } from "@/lib/auth/client";
import { adminNavConfig, authNavConfig, infoNavConfig, navMainConfig, translateAdminNav, translateNav } from "@/lib/navConfig";
import { cn } from "@/lib/utils";

import { NavLists } from "./nav-lists";
import { NavMain } from "./nav-main";
import { NavUser } from "./nav-user";

export function AppSidebar(props: ComponentProps<typeof Sidebar>) {
  const { t } = useTranslation("nav");
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const { data: session } = authClient.useSession();
  const { data: settings } = useSettings();
  const { visible: isWCO, isMacOS } = useWindowControlsOverlay();

  const navItems = useMemo(() => translateNav(navMainConfig, t), [t]);
  const infoNavItems = useMemo(() => translateNav(infoNavConfig, t), [t]);
  const showAuth = !!(session?.user && settings?.submissionsEnabled);
  const authNavItems = useMemo(() => (showAuth ? translateNav(authNavConfig, t) : []), [t, showAuth]);
  const userRole = session?.user?.role as string | undefined;
  const adminNavItems = useMemo(() => translateAdminNav(adminNavConfig, t, userRole, settings), [userRole, t, settings]);

  const location = useLocation();

  return (
    <Sidebar variant="inset" collapsible="icon" {...props}>
      {isWCO && isMacOS ? (
        <SidebarHeader
          style={{ height: "env(titlebar-area-height, 3rem)", WebkitAppRegion: "drag", appRegion: "drag" } as React.CSSProperties}
          className="flex items-center justify-center"
        >
          <img
            src="/btsearch.webp"
            alt={APP_NAME}
            width={185}
            height={65}
            className="h-10 w-auto object-contain dark:invert pointer-events-none group-data-[collapsible=icon]:hidden"
          />
          <img
            src="/btsearch_transparent.webp"
            alt={APP_NAME}
            width={1024}
            height={1024}
            className="hidden h-8 w-auto object-contain dark:invert pointer-events-none group-data-[collapsible=icon]:block"
          />
        </SidebarHeader>
      ) : !isWCO ? (
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" render={<Link to="/" />} className="justify-center">
                <img
                  src="/btsearch.webp"
                  alt={APP_NAME}
                  width={185}
                  height={65}
                  className="h-10 w-auto object-contain dark:invert group-data-[collapsible=icon]:hidden"
                />
                <img
                  src="/btsearch_transparent.webp"
                  alt={APP_NAME}
                  width={1024}
                  height={1024}
                  className="hidden h-8 w-auto object-contain dark:invert group-data-[collapsible=icon]:block"
                />
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
      ) : null}
      <SidebarContent>
        <NavMain items={navItems} />
        {authNavItems.length > 0 && <NavMain items={authNavItems} />}
        {session?.user && settings?.enableUserLists && <NavLists />}
        {adminNavItems.length > 0 && <NavMain items={adminNavItems} />}
        <NavMain items={infoNavItems} />
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link to="/settings" search={{ tab: "preferences" }} />}
              isActive={location.pathname === "/settings" && location.searchStr.includes("tab=preferences")}
            >
              <HugeiconsIcon icon={Settings02Icon} />
              <span>{t("items.preferences")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem className="group-data-[collapsible=icon]:hidden">
            <div className="grid grid-cols-2 gap-1">
              <ThemeToggle />
              <LanguageSwitcher />
            </div>
          </SidebarMenuItem>
          {!session?.user && (
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" onClick={() => setAuthDialogOpen(true)} className="cursor-pointer">
                <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <HugeiconsIcon icon={Login01Icon} className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{t("auth.signIn", "Sign In")}</span>
                  <span className="truncate text-xs text-muted-foreground">{t("auth.signInHint", "Access your account")}</span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          {session?.user && <NavUser data={session} />}
          <SidebarMenuItem className="group-data-[collapsible=icon]:hidden">
            <GoogleAd key={location.pathname} adSlot="4992722827" adFormat="rectangle" className="w-full h-62.5" />
          </SidebarMenuItem>
          <SidebarMenuItem className="group-data-[collapsible=icon]:hidden">
            <div className="flex items-center justify-between px-2 py-1 text-[10px] text-muted-foreground">
              {(import.meta.env.VITE_GIT_COMMIT || import.meta.env.VITE_APP_VERSION) && (
                <div
                  className="flex items-center gap-1.5 min-w-0"
                  title={[import.meta.env.VITE_GIT_COMMIT, import.meta.env.VITE_APP_VERSION && `v${import.meta.env.VITE_APP_VERSION}`]
                    .filter(Boolean)
                    .join(" · ")}
                >
                  <HugeiconsIcon icon={GitBranchIcon} className="size-3 shrink-0" />
                  <span className="truncate">
                    {import.meta.env.VITE_GIT_COMMIT && (
                      <a
                        href={`https://github.com/btsearch/btsearch/commit/${import.meta.env.VITE_GIT_COMMIT}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-primary hover:underline"
                      >
                        {import.meta.env.VITE_GIT_COMMIT}
                      </a>
                    )}
                    {import.meta.env.VITE_APP_VERSION && (
                      <span className="text-muted-foreground">
                        {import.meta.env.VITE_GIT_COMMIT ? " " : ""}(v{import.meta.env.VITE_APP_VERSION})
                      </span>
                    )}
                  </span>
                </div>
              )}
              <Link to="/changelog" className={cn("shrink-0 hover:underline p-2 -m-2", location.pathname === "/changelog" && "text-foreground")}>
                {t("items.changelog")}
              </Link>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <AuthDialog open={authDialogOpen} onOpenChange={setAuthDialogOpen} />
    </Sidebar>
  );
}
