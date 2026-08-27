import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type JSX, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { createList } from "@/features/lists/api";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialStationId?: number;
  initialRadiolineIds?: number[];
  initialUkeStationId?: number;
};

type ToggleProps = { checked: boolean; onChange: (checked: boolean) => void };

function Toggle({ checked, onChange }: ToggleProps): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn("relative inline-flex h-5 w-9 items-center rounded-full transition-colors", checked ? "bg-primary" : "bg-muted")}
    >
      <span
        className={cn(
          "inline-block h-3.5 w-3.5 rounded-full bg-background shadow-md transform transition-transform",
          checked ? "translate-x-4.5" : "translate-x-1",
        )}
      />
    </button>
  );
}

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
            <Label>{t("lists:public")}</Label>
            <Toggle checked={isPublic} onChange={setIsPublic} />
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
