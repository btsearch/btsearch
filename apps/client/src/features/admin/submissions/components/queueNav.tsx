import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type { Submission } from "@openbts/shared/contract";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type QueuedSubmission, reviewQueueQueryOptions, seedQueuedSubmission } from "@/features/admin/submissions/reviewQueue";

type QueueNavProps = {
  submission: QueuedSubmission;
};

type QueueStepProps = {
  neighbour: Submission | null;
  label: string;
  icon: IconSvgElement;
};

type QueueLinkProps = {
  submission: Submission;
  label: string;
  icon: IconSvgElement;
};

function QueueLink({ submission, label, icon }: QueueLinkProps) {
  const queryClient = useQueryClient();

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      nativeButton={false}
      render={
        <Link to="/admin/submissions/$id" params={{ id: submission.id }} replace onClick={() => seedQueuedSubmission(queryClient, submission)} />
      }
      className="cursor-pointer text-muted-foreground hover:text-foreground"
    >
      <HugeiconsIcon icon={icon} className="size-4" />
    </Button>
  );
}

function QueueStep({ neighbour, label, icon }: QueueStepProps) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span />}>
        {neighbour === null ? (
          <Button type="button" variant="ghost" size="icon-sm" aria-label={label} disabled>
            <HugeiconsIcon icon={icon} className="size-4" />
          </Button>
        ) : (
          <QueueLink submission={neighbour} label={label} icon={icon} />
        )}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function QueueNav({ submission }: QueueNavProps) {
  const { t } = useTranslation("submissions");
  const { data: queue } = useQuery(reviewQueueQueryOptions(submission));

  if (queue === undefined) return null;

  return (
    <div className="flex shrink-0 items-center gap-2 text-xs whitespace-nowrap text-muted-foreground">
      <span className="tabular-nums max-md:sr-only">
        {queue.place === null
          ? t("review.queue.pending", { count: queue.total })
          : t("review.queue.place", { place: queue.place, count: queue.total })}
      </span>
      <span className="flex items-center gap-0.5">
        <QueueStep neighbour={queue.previous} label={t("review.queue.previous")} icon={ArrowLeft01Icon} />
        <QueueStep neighbour={queue.next} label={t("review.queue.next")} icon={ArrowRight01Icon} />
      </span>
    </div>
  );
}
