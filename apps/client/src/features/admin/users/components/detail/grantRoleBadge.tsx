import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import type { GrantRole } from "../../types";
import { getGrantRoleLabel } from "../../utils/grants";
import { GRANT_ROLE_TONES } from "../shared/grantRoleTone";
import { Badge } from "@/components/ui/badge";

export function GrantRoleBadge({ role }: { role: GrantRole }) {
  const { t } = useTranslation("admin");
  const tone = GRANT_ROLE_TONES[role];

  return (
    <Badge variant="secondary" className={tone.badge}>
      <HugeiconsIcon icon={tone.icon} data-icon="inline-start" aria-hidden="true" />
      {getGrantRoleLabel(t, role)}
    </Badge>
  );
}
