import { useSettings } from "@/hooks/useSettings";
import { useSettledSession } from "@/hooks/useSettledSession";
import { STAFF_ROLES } from "@/lib/auth/roles";

export type CrowdAccess = {
  isAvailable: boolean;
  isSwitchedOff: boolean;
  isSignedIn: boolean;
  isStaff: boolean;
  isAdmin: boolean;
};

export function useCrowdAccess(): CrowdAccess {
  const { data: settings } = useSettings();
  const { data: session } = useSettledSession();
  const role = session?.user?.role;
  const isAdmin = role === "admin";
  const areObservationsOn = settings?.features.observations === true;

  return {
    isAvailable: areObservationsOn || (isAdmin && settings !== undefined),
    isSwitchedOff: settings !== undefined && !areObservationsOn && !isAdmin,
    isSignedIn: typeof session?.user?.id === "string",
    isStaff: typeof role === "string" && STAFF_ROLES.has(role),
    isAdmin,
  };
}
