import { Link } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";

import { UserHoverCard } from "./userHoverCard";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";

type UserLinkProps = {
  user: { username?: string | null; name?: string | null; image?: string | null } | null | undefined;
  className?: string;
  onNavigate?: () => void;
  children: ReactNode;
};

export function UserLink({ user, className, onNavigate, children }: UserLinkProps) {
  const [open, setOpen] = useState(false);
  const username = user?.username;
  if (!username) return <span className={className}>{children}</span>;

  const closeAndNavigate = () => {
    setOpen(false);
    onNavigate?.();
  };

  return (
    <HoverCard open={open} onOpenChange={setOpen}>
      <HoverCardTrigger
        delay={400}
        render={<Link to="/users/$username" params={{ username }} preload="intent" preloadDelay={150} />}
        className={cn("underline-offset-2 hover:underline data-popup-open:underline", className)}
        onClick={onNavigate}
      >
        {children}
      </HoverCardTrigger>
      <HoverCardContent align="start" sideOffset={6} collisionPadding={8} className="w-80 max-w-[calc(100vw-1rem)] overflow-hidden p-0">
        <UserHoverCard username={username} name={user?.name ?? null} image={user?.image ?? null} onNavigate={closeAndNavigate} />
      </HoverCardContent>
    </HoverCard>
  );
}
