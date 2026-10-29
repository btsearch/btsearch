import { Trans, useTranslation } from "react-i18next";

import { getDistinctPerformer, getUserRefName } from "../labels";
import type { AuditOperation } from "../types";
import { UserChip } from "./userChip";
import { META_USER_LINK_CLASS } from "@/features/admin/users/components/detail/userDetailPrimitives";
import { UserLink } from "@/features/user-profile/components/userLink";

type OperationActorProps = {
  operation: AuditOperation;
  linked?: boolean;
};

export function OperationActor({ operation, linked = false }: OperationActorProps) {
  const { t } = useTranslation("admin");
  const performer = getDistinctPerformer(operation);
  const performerName = getUserRefName(t, performer);

  return (
    <UserChip
      user={operation.actor}
      systemLabel={t("auditLogs.actor.system")}
      linked={linked}
      detail={
        performer === null ? undefined : (
          <Trans
            t={t}
            i18nKey="auditLogs.actor.via"
            values={{ name: performerName }}
            components={{
              user: (
                <UserLink user={linked ? performer : null} className={META_USER_LINK_CLASS}>
                  {performerName}
                </UserLink>
              ),
            }}
          />
        )
      }
    />
  );
}
