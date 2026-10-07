import { type FormEvent, Suspense, lazy, useState } from "react";
import { useTranslation } from "react-i18next";

import type { CountryView } from "../../types";
import { DialogFormFooter } from "../shared/dialogFormFooter";
import { REFERENCE_DESCRIPTION_CLASS, ReferenceMeta, ReferenceMetaItem } from "../shared/referenceCards";
import { useOpeningCount } from "../shared/useOpeningCount";
import { VIEW_EDGES, formatDegrees, useViewEdgeLabels } from "./defaultViewDraft";
import { ErrorBoundary } from "@/components/app/errorBoundary";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type DefaultViewMapDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialView: CountryView | null;
  onPick: (view: CountryView) => void;
};

type DefaultViewMapFormProps = {
  initialView: CountryView | null;
  onPick: (view: CountryView) => void;
  onCancel: () => void;
};

const DefaultViewPickerMap = lazy(() => import("./defaultViewMap").then((module) => ({ default: module.DefaultViewPickerMap })));

function VisibleViewSummary({ view }: { view: CountryView | null }) {
  const { t, i18n } = useTranslation("admin");
  const edgeLabels = useViewEdgeLabels();

  return (
    <div className={cn("min-h-4.5 tabular-nums", REFERENCE_DESCRIPTION_CLASS)}>
      {view === null ? (
        t("common:actions.loading")
      ) : (
        <ReferenceMeta>
          {VIEW_EDGES.map((edge) => (
            <ReferenceMetaItem key={edge}>
              {edgeLabels[edge]} {formatDegrees(view[edge], i18n.language)}
            </ReferenceMetaItem>
          ))}
        </ReferenceMeta>
      )}
    </div>
  );
}

function DefaultViewMapForm({ initialView, onPick, onCancel }: DefaultViewMapFormProps) {
  const { t } = useTranslation("admin");
  const [startView] = useState(initialView);
  const [visibleView, setVisibleView] = useState<CountryView | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (visibleView !== null) onPick(visibleView);
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-w-0 flex-col gap-4">
      <DialogHeader>
        <DialogTitle className="pr-7">{t("reference.country.general.defaultView.mapDialog.title")}</DialogTitle>
        <DialogDescription>{t("reference.country.general.defaultView.mapDialog.description")}</DialogDescription>
      </DialogHeader>
      <div className="relative h-72 overflow-hidden rounded-lg border bg-muted/50 sm:h-96">
        <ErrorBoundary
          fallback={() => (
            <ErrorState
              title={t("reference.country.general.defaultView.preview.failed")}
              description={null}
              className="h-full min-h-0 rounded-none border-0"
            />
          )}
        >
          <Suspense fallback={<Skeleton className="size-full rounded-none" />}>
            <DefaultViewPickerMap initialView={startView} onVisibleViewChange={setVisibleView} />
          </Suspense>
        </ErrorBoundary>
      </div>
      <VisibleViewSummary view={visibleView} />
      <DialogFormFooter
        submitLabel={t("reference.country.general.defaultView.mapDialog.confirm")}
        canSubmit={visibleView !== null}
        isPending={false}
        onCancel={onCancel}
      />
    </form>
  );
}

export function DefaultViewMapDialog({ open, onOpenChange, initialView, onPick }: DefaultViewMapDialogProps) {
  const openingCount = useOpeningCount(open);

  function pickView(view: CountryView) {
    onPick(view);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DefaultViewMapForm key={openingCount} initialView={initialView} onPick={pickView} onCancel={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
