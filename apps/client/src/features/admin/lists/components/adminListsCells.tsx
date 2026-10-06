import { AirportTowerIcon, Globe02Icon, LockIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { List } from "@openbts/shared/contract";
import { useTranslation } from "react-i18next";

import { UserAvatar } from "@/components/app/userAvatar";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getPickerUserHandle, getPickerUserName, toPickerAvatarUser } from "@/features/admin/users/picker/pickerUser";
import { UserLink } from "@/features/user-profile/components/userLink";
import { UPLINK_APPEARANCE } from "@/lib/format/uplink";
import { cn } from "@/lib/utils";

type ListOwnerRef = List["owner"];

const COUNT_CHIP_CLASS = "rounded bg-muted px-2 py-1 font-mono text-xs whitespace-nowrap";
const SMALL_AVATAR_CLASS = "size-5 *:data-[slot=avatar-fallback]:text-[0.5625rem]";
const UNKNOWN_OWNER = <span className="text-xs text-muted-foreground italic">-</span>;

export function ListName({ list }: { list: List }) {
  return (
    <div className="min-w-0">
      <div className="truncate font-medium">{list.name}</div>
      {list.description ? (
        <div title={list.description} className="truncate text-xs text-muted-foreground">
          {list.description}
        </div>
      ) : null}
    </div>
  );
}

export function ListOwner({ owner }: { owner: ListOwnerRef }) {
  const name = owner === undefined ? null : getPickerUserName(owner);
  if (owner === undefined || name === null) return UNKNOWN_OWNER;

  const handle = getPickerUserHandle(owner);

  return (
    <div className="flex min-w-0 items-center gap-2">
      <UserAvatar user={toPickerAvatarUser(owner)} size="sm" className="*:data-[slot=avatar-fallback]:text-[10px]" />
      <div className="min-w-0">
        <UserLink user={owner} className="block w-fit max-w-full truncate text-sm font-medium">
          {name}
        </UserLink>
        {handle === null ? null : <div className="truncate text-xs text-muted-foreground">{handle}</div>}
      </div>
    </div>
  );
}

export function ListOwnerLine({ owner, isLinked = false, className }: { owner: ListOwnerRef; isLinked?: boolean; className?: string }) {
  const name = owner === undefined ? null : getPickerUserName(owner);
  if (owner === undefined || name === null) return null;

  const handle = getPickerUserHandle(owner);
  const nameClass = "min-w-0 truncate text-sm font-medium";

  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <UserAvatar user={toPickerAvatarUser(owner)} className={SMALL_AVATAR_CLASS} />
      {isLinked ? (
        <UserLink user={owner} className={cn("relative z-10", nameClass)}>
          {name}
        </UserLink>
      ) : (
        <span className={nameClass}>{name}</span>
      )}
      {handle === null ? null : <span className="min-w-0 truncate text-xs text-muted-foreground">{handle}</span>}
    </div>
  );
}

export function ListVisibilityBadge({ isPublic }: { isPublic: boolean }) {
  const { t } = useTranslation("lists");

  return isPublic ? (
    <Badge variant="secondary" className="gap-1">
      <HugeiconsIcon icon={Globe02Icon} aria-hidden="true" className="size-3" />
      {t("lists:public")}
    </Badge>
  ) : (
    <Badge variant="outline" className="gap-1">
      <HugeiconsIcon icon={LockIcon} aria-hidden="true" className="size-3" />
      {t("lists:private")}
    </Badge>
  );
}

export function ListStationsChip({ list }: { list: List }) {
  const { t, i18n } = useTranslation("admin");
  const { stations, officialSites } = list.itemCounts;
  const stationsText = stations.toLocaleString(i18n.language);
  const databaseTip = t("admin:lists.stationsTip.database", { count: stations });
  const hasOfficialSites = officialSites > 0;

  return (
    <Tooltip>
      <TooltipTrigger render={<span className={COUNT_CHIP_CLASS} />}>
        {hasOfficialSites ? t("admin:lists.stationsPlusOfficial", { stations: stationsText, officialSites }) : stationsText}
      </TooltipTrigger>
      <TooltipContent>
        {hasOfficialSites
          ? t("admin:lists.stationsTip.both", { database: databaseTip, official: t("admin:lists.stationsTip.official", { count: officialSites }) })
          : databaseTip}
      </TooltipContent>
    </Tooltip>
  );
}

export function ListLinksChip({ list }: { list: List }) {
  const { i18n } = useTranslation();
  return <span className={COUNT_CHIP_CLASS}>{list.itemCounts.microwaveLinks.toLocaleString(i18n.language)}</span>;
}

export function ListCounts({ list }: { list: List }) {
  const { t } = useTranslation(["admin", "common", "lists"]);
  const { stations, officialSites, microwaveLinks } = list.itemCounts;
  const stationsText = t("common:labels.stations", { count: stations });

  return (
    <span className="inline-flex min-w-0 items-center gap-3 text-xs whitespace-nowrap text-muted-foreground">
      <span className="inline-flex items-center gap-1">
        <HugeiconsIcon icon={AirportTowerIcon} aria-hidden="true" className="size-3.5" />
        {officialSites > 0 ? t("admin:lists.stationsPlusOfficial", { stations: stationsText, officialSites }) : stationsText}
      </span>
      {microwaveLinks > 0 ? (
        <span className="inline-flex items-center gap-1">
          <HugeiconsIcon icon={UPLINK_APPEARANCE.microwave.icon} aria-hidden="true" className="size-3.5" />
          {t("lists:radiolineCount", { count: microwaveLinks })}
        </span>
      ) : null}
    </span>
  );
}
