import { UserIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Submission, UserRef } from "@openbts/shared/contract";
import { useTranslation } from "react-i18next";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { resolveDisplayName } from "@/features/admin/users/utils/identity";
import { EditCard } from "@/features/station-editing/components/frame/editCard";
import { UserLink } from "@/features/user-profile/components/userLink";
import { formatFullDate, resolveAvatarUrl } from "@/lib/format";

type SubmissionPersonProps = {
  user: UserRef | null;
  dateLabel: string;
  date: string | null;
  noteLabel: string;
  note: string | null;
  emptyNote: string;
};

type SubmitterCardProps = {
  submission: Pick<Submission, "submitter" | "createdAt" | "note">;
};

export function SubmissionPerson({ user, dateLabel, date, noteLabel, note, emptyNote }: SubmissionPersonProps) {
  const { t, i18n } = useTranslation("submissions");
  const name = user === null ? t("detail.deletedUser") : resolveDisplayName(user);

  return (
    <div className="space-y-4 px-4 py-3">
      <div className="flex items-start gap-4">
        <Avatar className="size-10 border">
          {user === null ? (
            <AvatarFallback>
              <HugeiconsIcon icon={UserIcon} className="size-4 text-muted-foreground" />
            </AvatarFallback>
          ) : (
            <>
              <AvatarImage src={resolveAvatarUrl(user.image)} />
              <AvatarFallback>{name.charAt(0).toUpperCase()}</AvatarFallback>
            </>
          )}
        </Avatar>
        <div className="min-w-0 flex-1 space-y-1">
          <UserLink user={user} className="block w-fit max-w-full truncate text-sm leading-4 font-medium">
            {name}
          </UserLink>
          {user?.username ? <p className="truncate text-xs text-muted-foreground">@{user.username}</p> : null}
          {date === null ? null : (
            <p className="text-[11px] text-muted-foreground">
              {dateLabel}: {formatFullDate(date, i18n.language)}
            </p>
          )}
        </div>
      </div>
      {note ? (
        <div className="space-y-1 rounded-r-lg border-l-4 border-primary/40 bg-primary/5 p-3">
          <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{noteLabel}</p>
          <p className="text-sm leading-relaxed wrap-break-word whitespace-pre-wrap">{note}</p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{emptyNote}</p>
      )}
    </div>
  );
}

export function SubmitterCard({ submission }: SubmitterCardProps) {
  const { t } = useTranslation("submissions");

  return (
    <EditCard title={t("detail.submitter")} icon={UserIcon} className="bg-card">
      <SubmissionPerson
        user={submission.submitter}
        dateLabel={t("detail.createdAt")}
        date={submission.createdAt}
        noteLabel={t("detail.submitterNotes")}
        note={submission.note}
        emptyNote={t("detail.noSubmitterNote")}
      />
    </EditCard>
  );
}
