import type { UserRef } from "@openbts/shared/contract";
import { Trans, useTranslation } from "react-i18next";

import { useContributorName } from "./contributorIdentity";
import { META_USER_LINK_CLASS } from "@/features/admin/users/components/detail/userDetailPrimitives";
import { UserLink } from "@/features/user-profile/components/userLink";

type ByUserTextProps = {
  i18nKey: string;
  user: UserRef;
  values?: Record<string, string>;
};

export function ByUserText({ i18nKey, user, values }: ByUserTextProps) {
  const { t } = useTranslation("admin");
  const name = useContributorName(user);

  return (
    <Trans
      t={t}
      i18nKey={i18nKey}
      values={{ ...values, name }}
      components={{
        user: (
          <UserLink user={user} className={META_USER_LINK_CLASS}>
            {name}
          </UserLink>
        ),
      }}
    />
  );
}
