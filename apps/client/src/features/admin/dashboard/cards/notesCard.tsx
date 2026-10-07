import { Suspense, lazy } from "react";
import { useTranslation } from "react-i18next";

import { DashboardCard, type DashboardLayout } from "./dashboardCard";
import { Skeleton } from "@/components/ui/skeleton";

type NotesCardProps = {
  layout: DashboardLayout;
  className?: string;
};

const EditorNotes = lazy(() => import("../EditorNotes").then((module) => ({ default: module.EditorNotes })));

function NotesSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-4" aria-hidden="true">
      <Skeleton className="h-4 w-56" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}

export function NotesCard({ layout, className }: NotesCardProps) {
  const { t } = useTranslation("common");

  return (
    <DashboardCard title={t("labels.notes")} isFilling={layout === "columns"} className={className}>
      <Suspense fallback={<NotesSkeleton />}>
        <EditorNotes />
      </Suspense>
    </DashboardCard>
  );
}
