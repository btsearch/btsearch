import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Link, useLocation } from "@tanstack/react-router";
import { memo, useCallback, useEffect, useState } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "nav-collapsed-state";
const DEFAULT_OPEN_KEYS = new Set(["stations", "info"]);

type NavSubItem = {
  title: string;
  url: string;
  href?: string;
  icon?: IconSvgElement;
};

type NavItem = {
  title: string;
  key: string;
  url: string;
  icon: IconSvgElement;
  items?: NavSubItem[];
};

export const NavMain = memo(function NavMain({ items }: { items: NavItem[] }) {
  const location = useLocation();
  const { state } = useSidebar();

  const getInitialState = useCallback(() => {
    const defaults = items.reduce<Record<string, boolean>>((acc, item) => {
      acc[item.key] = DEFAULT_OPEN_KEYS.has(item.key) || (item.items?.some((sub) => sub.url === location.pathname) ?? false);
      return acc;
    }, {});
    if (typeof window === "undefined") return defaults;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, boolean>;
        return items.reduce<Record<string, boolean>>((acc, item) => {
          acc[item.key] = item.key in parsed ? parsed[item.key] : defaults[item.key];
          return acc;
        }, {});
      }
    } catch {}
    return defaults;
  }, [items, location.pathname]);

  const [openState, setOpenState] = useState<Record<string, boolean>>(getInitialState);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const existing = stored ? (JSON.parse(stored) as Record<string, boolean>) : {};
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...existing, ...openState }));
    } catch {}
  }, [openState]);

  const handleOpenChange = (key: string, open: boolean) => {
    setOpenState((prev) => ({ ...prev, [key]: open }));
  };

  if (state === "collapsed") {
    return (
      <SidebarGroup>
        <SidebarMenu>
          {items.flatMap((item) =>
            (item.items ?? []).map((subItem) => (
              <SidebarMenuItem key={subItem.href ?? subItem.url}>
                <Tooltip>
                  <SidebarMenuButton
                    render={
                      subItem.href ? (
                        <TooltipTrigger render={<a href={subItem.href} target="_blank" rel="noopener noreferrer" />} />
                      ) : (
                        <TooltipTrigger render={<Link to={subItem.url} />} />
                      )
                    }
                    isActive={!subItem.href && location.pathname === subItem.url}
                  >
                    {subItem.icon && <HugeiconsIcon icon={subItem.icon} />}
                  </SidebarMenuButton>
                  <TooltipContent side="right">{subItem.title}</TooltipContent>
                </Tooltip>
              </SidebarMenuItem>
            )),
          )}
        </SidebarMenu>
      </SidebarGroup>
    );
  }

  return (
    <SidebarGroup>
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem key={item.key}>
            {item.items?.length ? (
              <Collapsible open={openState[item.key] ?? false} onOpenChange={(open) => handleOpenChange(item.key, open)}>
                <CollapsibleTrigger render={<SidebarMenuButton tooltip={item.title} />}>
                  <HugeiconsIcon icon={item.icon} />
                  <span>{item.title}</span>
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    className={cn("ml-auto size-4 transition-transform duration-200", openState[item.key] && "rotate-90")}
                  />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {item.items?.map((subItem) => (
                      <SidebarMenuSubItem key={subItem.href ?? subItem.url}>
                        <SidebarMenuSubButton
                          render={subItem.href ? <a href={subItem.href} target="_blank" rel="noopener noreferrer" /> : <Link to={subItem.url} />}
                          isActive={!subItem.href && location.pathname === subItem.url}
                        >
                          {subItem.icon && <HugeiconsIcon icon={subItem.icon} className="size-3.5" />}
                          <span>{subItem.title}</span>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </Collapsible>
            ) : (
              <SidebarMenuButton render={<Link to={item.url} />} tooltip={item.title}>
                <HugeiconsIcon icon={item.icon} />
                <span>{item.title}</span>
              </SidebarMenuButton>
            )}
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
});
