import { COMMENT_MAX_LENGTH } from "@openbts/shared/contract/constants";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type SubmitEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { storeUpdatedComment, updateStationCommentText } from "../station/comments/api";
import type { StationComment } from "../station/comments/types";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { showApiError } from "@/lib/api";

type EditCommentFormProps = {
  comment: StationComment;
  onClose: () => void;
};

export function EditCommentForm({ comment, onClose }: EditCommentFormProps) {
  const { t } = useTranslation(["common", "admin", "stationDetails"]);
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(comment.content);
  const typedText = draft.trim();

  const mutation = useMutation({
    mutationFn: (content: string) => updateStationCommentText(comment.id, content),
    onSuccess: (updated) => {
      storeUpdatedComment(queryClient, updated);
      if (updated.status === "pending") toast.info(t("stationDetails:comments.pendingApproval"));
      else toast.success(t("admin:comments.editSuccess"));
    },
    onError: (error) => showApiError(error),
  });

  const canSave = typedText !== "" && typedText !== comment.content.trim() && !mutation.isPending;

  const handleSubmit = (e: SubmitEvent) => {
    e.preventDefault();
    if (canSave) mutation.mutate(typedText, { onSuccess: onClose });
  };

  return (
    <form onSubmit={handleSubmit} className="mt-1.5 space-y-2">
      <Textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        maxLength={COMMENT_MAX_LENGTH}
        readOnly={mutation.isPending}
        aria-label={t("admin:comments.sheet.textLabel")}
        className="max-h-60 resize-none overflow-y-auto"
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" className="cursor-pointer" disabled={mutation.isPending} onClick={onClose}>
          {t("actions.cancel")}
        </Button>
        <Button type="submit" size="sm" className="cursor-pointer" disabled={!canSave}>
          {mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
          {t("actions.save")}
        </Button>
      </div>
    </form>
  );
}
