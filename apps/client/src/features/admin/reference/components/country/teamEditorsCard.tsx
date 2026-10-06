import { Delete02Icon, PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { TeamGrant } from "../../types";
import { CardAddButton, CardLoadState, CountBadge } from "../shared/cardParts";
import { CenteredCardState, ReferenceCard, ReferenceCardHeader, RowIconButton } from "../shared/referenceCards";
import { TEAM_ROW_BODY_CLASS, TEAM_ROW_CLASS, TEAM_ROW_ITEM_CLASS, TeamMemberAvatar, TeamMemberIdentity } from "./teamCardParts";
import type { TeamEntry } from "./teamMember";
import { Badge } from "@/components/ui/badge";
import { GrantChipSkeleton } from "@/features/admin/users/components/shared/grantChip";
import { GRANT_ROLE_TONES } from "@/features/admin/users/components/shared/grantRoleTone";
import { type RegionNameIndex, getGrantScope, indexRegionNames } from "@/features/admin/users/utils/grants";
import { regionsQueryOptions } from "@/features/shared/lookups";
import { cn } from "@/lib/utils";

type TeamEditorsCardProps = {
  entries: TeamEntry[] | undefined;
  hasLoadFailed: boolean;
  isRetrying: boolean;
  onRetry: () => void;
  canManage: boolean;
  areNamesLinked: boolean;
  onAdd: () => void;
  onEdit: (entry: TeamEntry) => void;
  onRemove: (entry: TeamEntry) => void;
};

type EditorScopeBadgesProps = {
  grant: TeamGrant;
  regionNames: RegionNameIndex | null;
  hasRegionsLoadFailed: boolean;
};

type EditorRowProps = {
  entry: TeamEntry;
  regionNames: RegionNameIndex | null;
  hasRegionsLoadFailed: boolean;
  canManage: boolean;
  areNamesLinked: boolean;
  onEdit: () => void;
  onRemove: () => void;
};

const SKELETON_ROW_COUNT = 2;

function EditorScopeBadges({ grant, regionNames, hasRegionsLoadFailed }: EditorScopeBadgesProps) {
  const { t } = useTranslation("admin");

  if (grant.regionIds === null) return <Badge variant="secondary">{t("users.shared.inline.wholeCountry")}</Badge>;
  if (regionNames === null) {
    if (!hasRegionsLoadFailed) return <GrantChipSkeleton />;
    return <Badge variant="secondary">{t("main:userProfile.regionCount", { count: grant.regionIds.length })}</Badge>;
  }

  const scope = getGrantScope(grant, regionNames);
  const regions = scope.kind === "regions" ? scope.regions : [];
  return regions.map((region) => (
    <Badge key={region.id} variant="secondary" className="max-w-full">
      <span className="truncate">{region.name}</span>
    </Badge>
  ));
}

function EditorRow({ entry, regionNames, hasRegionsLoadFailed, canManage, areNamesLinked, onEdit, onRemove }: EditorRowProps) {
  const { t } = useTranslation("admin");
  const { grant, member } = entry;

  return (
    <li className={TEAM_ROW_ITEM_CLASS}>
      <div className={TEAM_ROW_CLASS}>
        <TeamMemberAvatar member={member} />
        <div className={cn(TEAM_ROW_BODY_CLASS, "gap-1.5")}>
          <TeamMemberIdentity member={member} isLinked={areNamesLinked} className="@lg/member:w-44 @lg/member:shrink-0" />
          <div className="flex min-w-0 flex-wrap gap-1 @lg/member:flex-1">
            <EditorScopeBadges grant={grant} regionNames={regionNames} hasRegionsLoadFailed={hasRegionsLoadFailed} />
          </div>
        </div>
        {canManage ? (
          <div className="flex shrink-0 items-center gap-0.5">
            <RowIconButton label={t("reference.country.team.editors.changeScope", { name: member.name })} icon={PencilEdit02Icon} onClick={onEdit} />
            <RowIconButton
              label={t("reference.country.team.editors.remove", { name: member.name })}
              icon={Delete02Icon}
              destructive
              onClick={onRemove}
            />
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function TeamEditorsCard({
  entries,
  hasLoadFailed,
  isRetrying,
  onRetry,
  canManage,
  areNamesLinked,
  onAdd,
  onEdit,
  onRemove,
}: TeamEditorsCardProps) {
  const { t, i18n } = useTranslation("admin");
  const { data: regions, isError: hasRegionsLoadFailed } = useQuery(regionsQueryOptions());

  const regionNames = regions === undefined ? null : indexRegionNames(regions);
  const addLabel = t("reference.country.team.editors.add");

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
        icon={GRANT_ROLE_TONES.editor.icon}
        title={t("reference.country.team.editors.empty.title")}
        description={t("reference.country.team.editors.empty.description")}
        action={canManage ? <CardAddButton variant="outline" label={addLabel} onClick={onAdd} /> : null}
      />
    );
  } else {
    body = (
      <ul className="border-t">
        {entries.map((entry) => (
          <EditorRow
            key={entry.grant.id}
            entry={entry}
            regionNames={regionNames}
            hasRegionsLoadFailed={hasRegionsLoadFailed}
            canManage={canManage}
            areNamesLinked={areNamesLinked}
            onEdit={() => onEdit(entry)}
            onRemove={() => onRemove(entry)}
          />
        ))}
      </ul>
    );
  }

  return (
    <ReferenceCard>
      <ReferenceCardHeader
        title={t("reference.country.team.editors.title")}
        description={t("reference.country.team.editors.description")}
        badge={entries === undefined ? null : <CountBadge>{entries.length.toLocaleString(i18n.language)}</CountBadge>}
        action={canManage ? <CardAddButton label={addLabel} isCompactOnPhones disabled={entries === undefined} onClick={onAdd} /> : null}
      />
      {body}
    </ReferenceCard>
  );
}
