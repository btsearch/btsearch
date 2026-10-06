import { Delete02Icon } from "@hugeicons/core-free-icons";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";

import { CardAddButton, CardLoadState, CountBadge } from "../shared/cardParts";
import { CenteredCardState, ReferenceCard, ReferenceCardHeader, ReferenceCardNote, RowIconButton } from "../shared/referenceCards";
import { TEAM_ROW_BODY_CLASS, TEAM_ROW_CLASS, TEAM_ROW_ITEM_CLASS, TeamMemberAvatar, TeamMemberIdentity } from "./teamCardParts";
import type { TeamEntry } from "./teamMember";
import { usersByIdsQueryOptions } from "@/features/admin/users/api/users";
import { META_USER_LINK_CLASS } from "@/features/admin/users/components/detail/userDetailPrimitives";
import { GRANT_ROLE_TONES } from "@/features/admin/users/components/shared/grantRoleTone";
import type { NamedUserRef } from "@/features/admin/users/types";
import { UserLink } from "@/features/user-profile/components/userLink";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type TeamMaintainersCardProps = {
  entries: TeamEntry[] | undefined;
  hasLoadFailed: boolean;
  isRetrying: boolean;
  onRetry: () => void;
  canManage: boolean;
  onAdd: () => void;
  onRemove: (entry: TeamEntry) => void;
};

type MaintainerListProps = {
  entries: TeamEntry[];
  canManage: boolean;
  onRemove: (entry: TeamEntry) => void;
};

type MaintainerRowProps = {
  entry: TeamEntry;
  granter?: NamedUserRef;
  canManage: boolean;
  onRemove: () => void;
};

const SKELETON_ROW_COUNT = 2;
const GRANTED_CLASS = "text-xs leading-4 text-muted-foreground @lg/member:max-w-[55%] @lg/member:truncate";

function MaintainerRow({ entry, granter, canManage, onRemove }: MaintainerRowProps) {
  const { t, i18n } = useTranslation("admin");
  const { grant, member } = entry;
  const grantedOn = formatShortDate(grant.createdAt, i18n.language);

  return (
    <li className={TEAM_ROW_ITEM_CLASS}>
      <div className={TEAM_ROW_CLASS}>
        <TeamMemberAvatar member={member} />
        <div className={cn(TEAM_ROW_BODY_CLASS, "gap-0.5")}>
          <TeamMemberIdentity member={member} isLinked={canManage} className="@lg/member:flex-1" />
          <p className={GRANTED_CLASS}>
            {granter !== undefined && granter.name !== "" ? (
              <Trans
                t={t}
                i18nKey="admin:reference.country.team.maintainers.grantedBy"
                values={{ name: granter.name, date: grantedOn }}
                components={{
                  user: (
                    <UserLink user={granter} className={META_USER_LINK_CLASS}>
                      {granter.name}
                    </UserLink>
                  ),
                }}
              />
            ) : (
              t("users.detail.grants.grantedOn", { date: grantedOn })
            )}
          </p>
        </div>
        {canManage ? (
          <RowIconButton
            label={t("reference.country.team.maintainers.remove", { name: member.name })}
            icon={Delete02Icon}
            destructive
            onClick={onRemove}
          />
        ) : null}
      </div>
    </li>
  );
}

function MaintainerList({ entries, canManage, onRemove }: MaintainerListProps) {
  const { data: granters } = useQuery(
    usersByIdsQueryOptions(entries.flatMap(({ grant }) => (grant.grantedById === null ? [] : [grant.grantedById]))),
  );

  const grantersById = new Map((granters ?? []).map((granter) => [granter.id, granter]));

  return (
    <ul className="border-t">
      {entries.map((entry) => (
        <MaintainerRow
          key={entry.grant.id}
          entry={entry}
          granter={entry.grant.grantedById === null ? undefined : grantersById.get(entry.grant.grantedById)}
          canManage={canManage}
          onRemove={() => onRemove(entry)}
        />
      ))}
    </ul>
  );
}

export function TeamMaintainersCard({ entries, hasLoadFailed, isRetrying, onRetry, canManage, onAdd, onRemove }: TeamMaintainersCardProps) {
  const { t, i18n } = useTranslation("admin");
  const addLabel = t("reference.country.team.maintainers.add");

  let body: ReactNode;
  if (entries === undefined) {
    body = (
      <CardLoadState
        hasLoadFailed={hasLoadFailed}
        errorTitle={t("reference.country.team.loadFailed")}
        isRetrying={isRetrying}
        onRetry={onRetry}
        skeletonRowCount={SKELETON_ROW_COUNT}
      />
    );
  } else if (entries.length === 0) {
    body = (
      <CenteredCardState
        icon={GRANT_ROLE_TONES.maintainer.icon}
        title={t("reference.country.team.maintainers.empty.title")}
        description={t("reference.country.team.maintainers.empty.description")}
        action={canManage ? <CardAddButton variant="outline" label={addLabel} onClick={onAdd} /> : null}
      />
    );
  } else body = <MaintainerList entries={entries} canManage={canManage} onRemove={onRemove} />;

  return (
    <ReferenceCard>
      <ReferenceCardHeader
        title={t("reference.country.team.maintainers.title")}
        description={t("reference.country.team.maintainers.description")}
        badge={entries === undefined ? null : <CountBadge>{entries.length.toLocaleString(i18n.language)}</CountBadge>}
        action={canManage ? <CardAddButton label={addLabel} isCompactOnPhones disabled={entries === undefined} onClick={onAdd} /> : null}
      />
      {body}
      <ReferenceCardNote className="mt-auto">{t("reference.country.team.maintainers.note")}</ReferenceCardNote>
    </ReferenceCard>
  );
}
