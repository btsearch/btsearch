import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type JSX, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { LIST_DESCRIPTION_MAX_LENGTH, LIST_NAME_MAX_LENGTH, createOwnList, listKeys } from "@/features/lists/api";
import { ApiResponseError, isConflict, showApiError } from "@/lib/api";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialStationId?: number;
  initialRadiolineIds?: number[];
  initialUkeStationId?: number;
};

export function CreateListDialog({ open, onOpenChange, initialStationId, initialRadiolineIds, initialUkeStationId }: Props): JSX.Element {
  const { t } = useTranslation(["lists", "common"]);
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [takenName, setTakenName] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: createOwnList,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: listKeys.ownLists() });
      toast.success(t("lists:created"));
      onOpenChange(false);
    },
    onError: (error, list) => {
      if (isConflict(error)) {
        setTakenName(list.name);
        return;
      }
      if (error instanceof ApiResponseError && error.errors.some((entry) => entry.code === "LIST_LIMIT_REACHED")) {
        toast.error(t("lists:limitReached"), { description: t("lists:limitReachedHint") });
        return;
      }
      showApiError(error);
    },
  });

  const trimmedName = name.trim();
  const isNameTaken = takenName === trimmedName;

  function handleSubmit() {
    if (!open || !trimmedName || isNameTaken || mutation.isPending) return;
    mutation.mutate({
      name: trimmedName,
      description: description.trim() || undefined,
      isPublic,
      items: {
        stationIds: initialStationId ? [initialStationId] : [],
        officialSiteIds: initialUkeStationId ? [initialUkeStationId] : [],
        microwaveLinkIds: initialRadiolineIds ?? [],
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("lists:create")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field data-invalid={isNameTaken || undefined}>
            <Label htmlFor="list-name">{t("common:labels.name")}</Label>
            <Input
              id="list-name"
              {...NO_AUTOFILL_PROPS}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              maxLength={LIST_NAME_MAX_LENGTH}
              aria-invalid={isNameTaken || undefined}
            />
            {isNameTaken ? <FieldError>{t("lists:nameTaken")}</FieldError> : null}
          </Field>
          <div className="space-y-2">
            <Label htmlFor="list-description">{t("lists:description")}</Label>
            <Input
              id="list-description"
              {...NO_AUTOFILL_PROPS}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("common:placeholder.optional")}
              maxLength={LIST_DESCRIPTION_MAX_LENGTH}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="list-public">{t("lists:public")}</Label>
            <Switch id="list-public" checked={isPublic} onCheckedChange={setIsPublic} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common:actions.cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={!trimmedName || isNameTaken || mutation.isPending}>
            {mutation.isPending ? <Spinner /> : t("lists:create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
