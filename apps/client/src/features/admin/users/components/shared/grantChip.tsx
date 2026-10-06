import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { RoleGrant } from "../../types";
import { type RegionNameIndex, describeGrant, getGrantChipLabel, getGrantScope } from "../../utils/grants";
import { GRANT_ROLE_TONES } from "./grantRoleTone";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type GrantChipProps = {
  grant: RoleGrant;
  regionNames: RegionNameIndex;
};

type GrantChipListProps = {
  grants: readonly RoleGrant[];
  regionNames: RegionNameIndex;
  limit?: number;
};

const GRANT_CHIP_LIMIT = 2;

function ChipTooltip({ text, children }: { text: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span />} className="inline-flex shrink-0">
        {children}
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}

function GrantChip({ grant, regionNames }: GrantChipProps) {
  const { t } = useTranslation("admin");
  const isMaintainer = grant.role === "maintainer";
  const scope = getGrantScope(grant, regionNames);
  const chip = (
    <Badge variant="secondary" className={cn("max-w-56", isMaintainer && GRANT_ROLE_TONES.maintainer.badge)}>
      {isMaintainer ? <HugeiconsIcon icon={GRANT_ROLE_TONES.maintainer.icon} data-icon="inline-start" aria-hidden="true" /> : null}
      <span className="font-bold">{grant.countryCode}</span>
      <span className="truncate">{getGrantChipLabel(t, grant.role, scope)}</span>
    </Badge>
  );

  if (isMaintainer || scope.kind === "country" || scope.regions.length < 2) return chip;
  return <ChipTooltip text={scope.regions.map((region) => region.name).join(", ")}>{chip}</ChipTooltip>;
}

export function GrantChipList({ grants, regionNames, limit = GRANT_CHIP_LIMIT }: GrantChipListProps) {
  const { t } = useTranslation("admin");
  const visible = grants.slice(0, limit);
  const hidden = grants.slice(limit);

  return (
    <>
      {visible.map((grant) => (
        <GrantChip key={grant.id} grant={grant} regionNames={regionNames} />
      ))}
      {hidden.length > 0 ? (
        <ChipTooltip text={hidden.map((grant) => describeGrant(t, grant, regionNames)).join(", ")}>
          <Badge variant="secondary">+{hidden.length}</Badge>
        </ChipTooltip>
      ) : null}
    </>
  );
}

export function GrantChipSkeleton() {
  return <Skeleton aria-hidden="true" className="h-5 w-24 shrink-0 rounded-4xl" />;
}
