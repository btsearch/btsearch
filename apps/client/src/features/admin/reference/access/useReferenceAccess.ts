import type { RoleGrant } from "@openbts/shared/contract";

import { useSettledSession } from "@/hooks/useSettledSession";
import { useEditorMe } from "@/lib/auth/me";

type ReferenceAccess = {
  isPending: boolean;
  hasLoadFailed: boolean;
  isAdmin: boolean;
  canOpenCountries: boolean;
  canOpenCountry: (code: string) => boolean;
  canManageEditors: (code: string) => boolean;
  retry: () => void;
};

const NO_COUNTRY_CODES: string[] = [];

function listMaintainedCountryCodes(grants: readonly RoleGrant[]): string[] {
  const countryCodes = new Set<string>();
  for (const grant of grants) if (grant.role === "maintainer") countryCodes.add(grant.countryCode);
  return [...countryCodes].sort();
}

export function useReferenceAccess(): ReferenceAccess {
  const { data: session, isPending: isSessionPending } = useSettledSession();
  const role = session?.user?.role;
  const isAdmin = role === "admin";
  const isEditor = role === "editor";
  const { data: me, isPending: isMePending, isError: hasMeFailed, refetch: refetchMe } = useEditorMe(session?.user?.id, isEditor);

  const maintainedCountryCodes = isEditor && me !== undefined ? listMaintainedCountryCodes(me.grants) : NO_COUNTRY_CODES;
  const hasCountryAccess = (code: string) => isAdmin || maintainedCountryCodes.includes(code);

  return {
    isPending: isSessionPending || (isEditor && isMePending),
    hasLoadFailed: isEditor && me === undefined && hasMeFailed,
    isAdmin,
    canOpenCountries: isAdmin || maintainedCountryCodes.length > 0,
    canOpenCountry: hasCountryAccess,
    canManageEditors: hasCountryAccess,
    retry: () => void refetchMe(),
  };
}
