import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Link, useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { REFERENCE_TWO_COLUMN_CLASS } from "./referenceSection";
import { buttonVariants } from "@/components/ui/button";
import { PageErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavMode } from "@/hooks/usePreferences";
import { cn } from "@/lib/utils";

type ReferenceListLinkProps = {
  to: string;
  className?: string;
  children: ReactNode;
};

type BackToListButtonProps = {
  to: string;
  variant: "default" | "outline";
};

type ReferenceNotFoundProps = {
  icon: IconSvgElement;
  title: string;
  description: string;
  listPath: string;
};

type ReferenceDetailShellProps = {
  backTo: string;
  backLabel: string;
  notice?: ReactNode;
  children: ReactNode;
};

const TRAILING_SLASH = /\/$/;
const BACK_LINK_CLASS = cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-1.5 text-muted-foreground");

function isPreviousHistoryEntry(path: string): boolean {
  if (!("navigation" in window)) return false;
  const { currentEntry } = window.navigation;
  if (currentEntry === null || currentEntry.index < 1) return false;

  const previousUrl = window.navigation.entries().at(currentEntry.index - 1)?.url;
  if (!previousUrl) return false;
  return new URL(previousUrl).pathname.replace(TRAILING_SLASH, "") === path;
}

export function useReturnToList(listPath: string): () => void {
  const router = useRouter();

  return () => {
    if (isPreviousHistoryEntry(listPath)) router.history.back();
    else void router.navigate({ to: listPath, replace: true });
  };
}

function ReferenceListLink({ to, className, children }: ReferenceListLinkProps) {
  const router = useRouter();

  return (
    <Link
      to={to}
      activeOptions={{ exact: true }}
      className={className}
      onClick={(event) => {
        const isModifiedClick = event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
        if (isModifiedClick || !isPreviousHistoryEntry(to)) return;
        event.preventDefault();
        router.history.back();
      }}
    >
      {children}
    </Link>
  );
}

export function BackToListButton({ to, variant }: BackToListButtonProps) {
  const { t } = useTranslation("common");

  return (
    <ReferenceListLink to={to} className={buttonVariants({ variant })}>
      <HugeiconsIcon icon={ArrowLeft01Icon} data-icon="inline-start" aria-hidden="true" />
      {t("actions.back")}
    </ReferenceListLink>
  );
}

export function ReferenceNotFound({ icon, title, description, listPath }: ReferenceNotFoundProps) {
  return (
    <PageErrorState
      tone="neutral"
      icon={icon}
      title={title}
      description={description}
      action={<BackToListButton to={listPath} variant="default" />}
    />
  );
}

export function ReferenceDetailShell({ backTo, backLabel, notice, children }: ReferenceDetailShellProps) {
  const navMode = useNavMode();

  return (
    <div className="@container custom-scrollbar flex-1 overflow-y-auto">
      <div className={cn("w-full px-3 pt-5 sm:px-6 lg:px-8", navMode === "floating" ? "pb-32" : "pb-10")}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <ReferenceListLink to={backTo} className={BACK_LINK_CLASS}>
            <HugeiconsIcon icon={ArrowLeft01Icon} data-icon="inline-start" aria-hidden="true" />
            {backLabel}
          </ReferenceListLink>
          {notice}
        </div>
        {children}
      </div>
    </div>
  );
}

export function ReferenceDetailSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-10 sm:gap-12">
      <div className="overflow-hidden rounded-2xl border border-border/70">
        <div className="flex items-center gap-3.5 px-4 py-4 sm:gap-5 sm:px-7 sm:py-6">
          <Skeleton className="size-12 shrink-0 rounded-lg sm:size-18 sm:rounded-2xl" />
          <div className="min-w-0 flex-1 space-y-2.5">
            <Skeleton className="h-6 w-44 max-w-full sm:h-7" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
        </div>
        <div className="flex gap-5 border-t border-border/60 px-4 py-3 sm:px-7">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-5 w-24 max-sm:hidden" />
        </div>
      </div>
      <div className="space-y-4">
        <Skeleton className="h-3 w-24" />
        <div className={REFERENCE_TWO_COLUMN_CLASS}>
          <Skeleton className="h-45 w-full rounded-xl" />
          <Skeleton className="h-45 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
