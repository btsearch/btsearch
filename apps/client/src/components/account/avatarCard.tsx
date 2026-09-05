import { Delete02Icon, Upload04Icon, UserIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation } from "@tanstack/react-query";
import { Suspense, lazy, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { API_BASE, fetchJson } from "@/lib/api";
import { authClient } from "@/lib/auth/client";
import { resolveAvatarUrl } from "@/lib/format";

const AvatarCropDialog = lazy(() => import("./avatarCropDialog").then((m) => ({ default: m.AvatarCropDialog })));

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function AvatarCard() {
  const { t } = useTranslation("settings");
  const { data: session } = authClient.useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  const user = session?.user;
  const imageUrl = resolveAvatarUrl(user?.image);
  const initials = user?.name ? getInitials(user.name) : "?";
  const isUploadedImage = !!user?.image && !user.image.startsWith("http");

  const uploadMutation = useMutation({
    mutationFn: async (blob: Blob) => {
      const formData = new FormData();
      formData.append("file", blob, "avatar.jpg");
      return fetchJson<{ data: { image: string } }>(`${API_BASE}/account/avatar`, {
        method: "POST",
        body: formData,
      });
    },
    onSuccess: async (res) => {
      await authClient.updateUser({ image: res.data.image });
      toast.success(t("account.avatar.uploadSuccess"));
    },
    onError: (err: Error) => toast.error(err.message || t("account.avatar.uploadError")),
  });

  const removeMutation = useMutation({
    mutationFn: () => fetchJson<{ data: null }>(`${API_BASE}/account/avatar`, { method: "DELETE" }),
    onSuccess: async () => {
      await authClient.updateUser({ image: null });
      toast.success(t("account.avatar.removeSuccess"));
    },
    onError: (err: Error) => toast.error(err.message || t("account.avatar.removeError")),
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result as string);
    reader.readAsDataURL(file);
  }

  function handleCropConfirm(blob: Blob) {
    setCropSrc(null);
    uploadMutation.mutate(blob);
  }

  function handleCropClose() {
    setCropSrc(null);
  }

  const isBusy = uploadMutation.isPending || removeMutation.isPending;

  return (
    <>
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-4 py-3.5 border-b flex items-center gap-2.5">
          <div className="size-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <HugeiconsIcon icon={UserIcon} className="size-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-none">{t("account.avatar.title")}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("account.avatar.subtitle")}</p>
          </div>
        </div>

        <div className="p-4 flex items-center gap-4">
          <Avatar className="size-14 shrink-0">
            <AvatarImage src={imageUrl} />
            <AvatarFallback className="text-base">{initials}</AvatarFallback>
          </Avatar>

          <div className="flex flex-col gap-2 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" variant="outline" disabled={isBusy} onClick={() => fileInputRef.current?.click()}>
                {uploadMutation.isPending ? <Spinner className="size-3.5" /> : <HugeiconsIcon icon={Upload04Icon} className="size-3.5" />}
                {t(uploadMutation.isPending ? "account.avatar.uploading" : "account.avatar.upload")}
              </Button>

              {isUploadedImage ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isBusy}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => removeMutation.mutate()}
                >
                  {removeMutation.isPending ? <Spinner className="size-3.5" /> : <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />}
                  {t(removeMutation.isPending ? "account.avatar.removing" : "account.avatar.remove")}
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">{t("account.avatar.hint")}</p>
          </div>
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

      {cropSrc !== null ? (
        <Suspense>
          <AvatarCropDialog open={cropSrc !== null} src={cropSrc} onConfirm={handleCropConfirm} onClose={handleCropClose} />
        </Suspense>
      ) : null}
    </>
  );
}
