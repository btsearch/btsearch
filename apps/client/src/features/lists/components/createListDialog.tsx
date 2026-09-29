import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type JSX, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { createList } from "@/features/lists/api";
import { ApiResponseError, showApiError } from "@/lib/api";

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

  const mutation = useMutation({
    mutationFn: createList,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["user-lists"] });
      toast.success(t("lists:created"));
      onOpenChange(false);
      setName("");
      setDescription("");
      setIsPublic(false);
    },
    onError: (error) => {
      if (error instanceof ApiResponseError && error.errors.some((entry) => entry.code === "LIST_LIMIT_REACHED")) {
        toast.error(t("lists:limitReached"), { description: t("lists:limitReachedHint") });
        return;
      }
      showApiError(error);
    },
  });

  function handleSubmit() {
    if (!name.trim()) return;
    mutation.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      is_public: isPublic,
      stations: {
        internal: initialStationId ? [initialStationId] : [],
        uke: initialUkeStationId ? [initialUkeStationId] : [],
      },
      radiolines: initialRadiolineIds ?? [],
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("lists:create")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="list-name">{t("lists:name")}</Label>
            <Input id="list-name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSubmit()} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="list-description">{t("lists:description")}</Label>
            <Input
              id="list-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("common:placeholder.optional")}
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
          <Button onClick={handleSubmit} disabled={!name.trim() || mutation.isPending}>
            {mutation.isPending ? <Spinner /> : t("lists:create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
