import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { type BanRequest, banUser, showUserAdminError, storeUpdatedAccount } from "../../api/authAdmin";
import type { AdminUser } from "../../types";
import {
  BAN_DURATIONS,
  type BanDurationId,
  computeBanExpiresAt,
  formatBanExpiry,
  getBanDurationLabel,
  getBanDurationSeconds,
  readBanReason,
} from "../../utils/ban";
import { getAccountName } from "../../utils/identity";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { SegmentedControl } from "@/features/settings/components/settingsPrimitives";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";

export type BanDialogMode = "ban" | "change";

const BAN_REASON_MAX_LENGTH = 200;
const DEFAULT_BAN_DURATION: BanDurationId = "week";

type BanFormProps = {
  user: AdminUser;
  mode: BanDialogMode;
  isPending: boolean;
  onSubmit: (ban: BanRequest) => void;
  onCancel: () => void;
};

type ModerationBanDialogProps = {
  user: AdminUser;
  mode: BanDialogMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function getInitialReason(user: AdminUser, mode: BanDialogMode): string {
  return mode === "change" ? (readBanReason(user.banReason) ?? "") : "";
}

function getInitialDuration(user: AdminUser, mode: BanDialogMode): BanDurationId {
  return mode === "change" && user.banExpiresAt === null ? "permanent" : DEFAULT_BAN_DURATION;
}

function BanForm({ user, mode, isPending, onSubmit, onCancel }: BanFormProps) {
  const { t, i18n } = useTranslation("admin");
  const reasonId = useId();
  const durationTitleId = useId();
  const [openedAt] = useState(Date.now);
  const [reason, setReason] = useState(() => getInitialReason(user, mode));
  const [durationId, setDurationId] = useState(() => getInitialDuration(user, mode));

  const isChange = mode === "change";
  const accountName = getAccountName(user);
  const durationOptions = BAN_DURATIONS.map((duration) => ({ value: duration.id, label: getBanDurationLabel(t, duration.id) }));
  const expiresAt = computeBanExpiresAt(durationId, new Date(openedAt));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({ reason, expiresInSeconds: getBanDurationSeconds(durationId) });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{isChange ? t("users.detail.moderation.banDialog.changeTitle") : t("users.detail.moderation.ban.title")}</DialogTitle>
        <DialogDescription>
          {isChange
            ? t("users.detail.moderation.banDialog.changeDescription", { name: accountName })
            : t("users.detail.moderation.banDialog.description", { name: accountName })}
        </DialogDescription>
      </DialogHeader>
      <Field>
        <FieldLabel htmlFor={reasonId}>{t("users.detail.moderation.banDialog.reason")}</FieldLabel>
        <Input
          id={reasonId}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={t("common:placeholder.optional")}
          maxLength={BAN_REASON_MAX_LENGTH}
          {...NO_AUTOFILL_PROPS}
          disabled={isPending}
        />
        <FieldDescription>{t("users.detail.moderation.banDialog.reasonHint")}</FieldDescription>
      </Field>
      <Field>
        <FieldTitle id={durationTitleId}>{t("users.detail.moderation.banDialog.duration")}</FieldTitle>
        <SegmentedControl
          value={durationId}
          options={durationOptions}
          onValueChange={setDurationId}
          ariaLabelledBy={durationTitleId}
          disabled={isPending}
          className="flex w-full *:flex-auto"
        />
        <FieldDescription>
          {expiresAt === null
            ? t("users.detail.moderation.banDialog.noExpiry")
            : t("users.detail.moderation.banDialog.expiresAt", { date: formatBanExpiry(expiresAt, i18n.language, "long") })}
        </FieldDescription>
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" className="cursor-pointer" disabled={isPending} onClick={onCancel}>
          {t("common:actions.cancel")}
        </Button>
        <Button type="submit" variant={isChange ? "default" : "destructive"} className="cursor-pointer" disabled={isPending}>
          {isPending ? <Spinner /> : null}
          {isChange ? t("common:actions.save") : t("users.detail.moderation.ban.action")}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ModerationBanDialog({ user, mode, open, onOpenChange }: ModerationBanDialogProps) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();

  const banMutation = useMutation({
    mutationFn: (ban: BanRequest) => banUser(user.id, ban),
    onSuccess: (updatedUser) => {
      onOpenChange(false);
      storeUpdatedAccount(queryClient, updatedUser);
      toast.success(mode === "change" ? t("users.detail.moderation.banDialog.changeSuccess") : t("users.detail.moderation.ban.banned"));
    },
    onError: showUserAdminError,
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!banMutation.isPending) onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <BanForm
          user={user}
          mode={mode}
          isPending={banMutation.isPending}
          onSubmit={(ban) => banMutation.mutate(ban)}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
