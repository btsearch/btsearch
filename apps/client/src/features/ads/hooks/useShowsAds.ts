import { useSettledSession } from "@/hooks/useSettledSession";
import { STAFF_ROLES } from "@/lib/auth/roles";

export function useShowsAds() {
  const { data: session, isPending } = useSettledSession();
  return { showsAds: !STAFF_ROLES.has(session?.user?.role as string), isPending };
}
