import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { EvidenceBackLink } from "./evidenceHeader";
import { buttonVariants } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";

type EvidenceStatePageProps = {
  flagId: number | null;
  children: ReactNode;
};

type MissingSiteProps = {
  flagId: number | null;
};

export const EVIDENCE_PAGE_CLASS = "flex min-h-0 flex-1 flex-col overflow-hidden";

export function EvidenceSkeleton() {
  return (
    <div className={EVIDENCE_PAGE_CLASS} aria-busy="true">
      <div className="flex shrink-0 flex-col gap-2 border-b px-4 py-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-5 w-72" />
      </div>
      <div className="flex min-h-0 flex-1 max-md:flex-col">
        <Skeleton className="min-h-0 flex-1 rounded-none max-md:h-[55svh] max-md:flex-none" />
        <div className="flex flex-col gap-4 border-l p-4 md:w-95">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    </div>
  );
}

export function EvidenceStatePage({ flagId, children }: EvidenceStatePageProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
      <div className="flex h-8 items-center px-1">
        <EvidenceBackLink flagId={flagId} />
      </div>
      {children}
    </div>
  );
}

export function MissingSite({ flagId }: MissingSiteProps) {
  const { t } = useTranslation("admin");

  return (
    <EvidenceStatePage flagId={flagId}>
      <ErrorState
        tone="neutral"
        className="min-h-0 flex-1"
        title={t("observationFlags.evidence.missing.title")}
        description={t("observationFlags.evidence.missing.description")}
        action={
          <Link to="/admin/observation-flags" className={buttonVariants({ variant: "outline", size: "sm" })}>
            {t("observationFlags.detail.backToList")}
          </Link>
        }
      />
    </EvidenceStatePage>
  );
}
