import { LockKeyIcon, Radar01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { PROFILE_GRID_CLASS } from "./profileSections";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsCard, SettingsRowSkeleton } from "@/features/settings/components/settingsPrimitives";
import { cn } from "@/lib/utils";

function StatePanel({ icon, title, description, dashed = false }: { icon: IconSvgElement; title: string; description: string; dashed?: boolean }) {
  return (
    <div className={cn("flex flex-col items-center rounded-xl border px-6 py-14 text-center", dashed ? "border-dashed" : "bg-card")}>
      <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <HugeiconsIcon icon={icon} className="size-5" aria-hidden="true" />
      </div>
      <p className="mt-4 text-base font-semibold">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export function PrivateProfileNotice() {
  const { t } = useTranslation("main");
  return <StatePanel icon={LockKeyIcon} title={t("userProfile.privateTitle")} description={t("userProfile.privateSubtitle")} />;
}

export function EmptyProfile() {
  const { t } = useTranslation("main");
  return <StatePanel dashed icon={Radar01Icon} title={t("userProfile.empty.title")} description={t("userProfile.empty.description")} />;
}

function SectionSkeleton({ labelClassName, children }: { labelClassName: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Skeleton className={cn("h-3", labelClassName)} />
        <div className="h-px flex-1 bg-border" />
      </div>
      {children}
    </div>
  );
}

function CommentSkeleton() {
  return (
    <div className="space-y-3 border-t px-4 py-3.5 sm:px-5 sm:py-4">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-6.5 w-36 rounded-lg" />
        <Skeleton className="h-3 w-16" />
      </div>
      <Skeleton className="h-3.5 w-full" />
      <Skeleton className="h-3.5 w-3/4" />
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-8">
      <div className="overflow-hidden rounded-2xl border border-border/70">
        <div className="flex items-center gap-3.5 px-4 py-4 sm:gap-5 sm:px-7 sm:py-7">
          <Skeleton className="size-16 shrink-0 rounded-full sm:size-22" />
          <div className="min-w-0 flex-1 space-y-2.5">
            <Skeleton className="h-6 w-44 max-w-full sm:h-8" />
            <Skeleton className="h-4 w-60 max-w-full" />
          </div>
        </div>
        <div className="flex gap-1.5 border-t border-border/60 px-4 py-3 sm:px-7">
          <Skeleton className="h-7 w-28 rounded-lg" />
          <Skeleton className="h-7 w-36 rounded-lg" />
        </div>
      </div>
      <div className={PROFILE_GRID_CLASS}>
        <div className="flex flex-col gap-8">
          <SectionSkeleton labelClassName="w-16">
            <SettingsCard className="gap-2 px-4 py-4 sm:px-5">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-11/12" />
              <Skeleton className="h-3.5 w-2/3" />
            </SettingsCard>
          </SectionSkeleton>
          <SectionSkeleton labelClassName="w-14">
            <SettingsCard>
              <SettingsRowSkeleton />
              <SettingsRowSkeleton />
            </SettingsCard>
          </SectionSkeleton>
        </div>
        <SectionSkeleton labelClassName="w-24">
          <SettingsCard>
            <div className="px-4 py-3 sm:px-5">
              <Skeleton className="h-8 w-64 max-w-full rounded-lg" />
            </div>
            <CommentSkeleton />
            <CommentSkeleton />
            <CommentSkeleton />
          </SettingsCard>
        </SectionSkeleton>
      </div>
    </div>
  );
}
