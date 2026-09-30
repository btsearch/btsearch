import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials, resolveAvatarUrl } from "@/lib/format";

type UserAvatarProps = {
  user: { name: string; image?: string | null };
  size?: "sm" | "default" | "lg";
  className?: string;
};

export function UserAvatar({ user, size, className }: UserAvatarProps) {
  return (
    <Avatar size={size} className={className}>
      <AvatarImage src={resolveAvatarUrl(user.image)} alt="" />
      <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
    </Avatar>
  );
}
