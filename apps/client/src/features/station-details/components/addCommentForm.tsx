import { Cancel01Icon, ImageAdd01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ChangeEvent, type SubmitEvent, useCallback, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { PhotoWithFallback } from "@/components/photos/photoGridPrimitives";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { API_BASE, fetchJson } from "@/lib/api";
import { photoQualityErrorKey } from "@/lib/photoUploadError";
import { cn } from "@/lib/utils";

type ImagePreview = {
  id: string;
  file: File;
  previewUrl: string;
};

type AddCommentFormProps = {
  stationId: number;
};

async function postComment(stationId: number, content: string, files: File[]) {
  const formData = new FormData();
  formData.append("content", content);
  for (const file of files) {
    formData.append("files", file);
  }

  return fetchJson<{ data: { status: "pending" | "approved" } }>(`${API_BASE}/stations/${stationId}/comments`, {
    method: "POST",
    body: formData,
  });
}

const MAX_PHOTOS = 5;

export function AddCommentForm({ stationId }: AddCommentFormProps) {
  const { t } = useTranslation(["stationDetails", "submissions"]);
  const [content, setContent] = useState("");
  const [images, setImages] = useState<ImagePreview[]>([]);
  const contentId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      postComment(
        stationId,
        content,
        images.map((img) => img.file),
      ),
    onSuccess: (res: { data: { status: "pending" | "approved" } }) => {
      setContent("");
      setImages([]);
      if (res.data.status === "pending") toast.info(t("comments.pendingApproval"));
      void queryClient.invalidateQueries({ queryKey: ["station-comments", stationId] });
    },
  });

  const handleAddImages = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter((file) => file.type.startsWith("image/"));

    setImages((prev) => {
      const remaining = MAX_PHOTOS - prev.length;
      const filesToAdd = validFiles.slice(0, remaining);
      const newImages: ImagePreview[] = filesToAdd.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl: URL.createObjectURL(file),
      }));
      return [...prev, ...newImages];
    });

    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleRemoveImage = useCallback((id: string) => {
    setImages((prev) => {
      const updated = prev.filter((img) => img.id !== id);
      const removed = prev.find((img) => img.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return updated;
    });
  }, []);

  const handleSubmit = (e: SubmitEvent) => {
    e.preventDefault();
    if (!content.trim() && images.length === 0) return;
    mutation.mutate();
  };

  const isDisabled = mutation.isPending || (!content.trim() && images.length === 0);
  const qualityErrorKey = photoQualityErrorKey(mutation.error);

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <label htmlFor={contentId} className="sr-only">
        {t("comments.addComment")}
      </label>
      <div className="overflow-hidden rounded-xl border border-input bg-background transition-colors focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/20">
        <Textarea
          id={contentId}
          placeholder={t("comments.placeholder")}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={mutation.isPending}
          className="min-h-20 max-h-60 resize-none overflow-y-auto rounded-none border-0 bg-transparent px-3 py-3 shadow-none focus-visible:border-transparent focus-visible:ring-0 disabled:bg-transparent dark:bg-transparent"
        />

        {images.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 pb-3">
            {images.map((image, index) => (
              <div key={image.id} className="group relative overflow-hidden rounded-lg border bg-muted/20">
                <PhotoWithFallback
                  src={image.previewUrl}
                  alt=""
                  className="size-20 object-cover"
                  fallbackClassName="gap-1 px-1 text-[9px] leading-tight [&_svg]:size-4"
                />
                <button
                  type="button"
                  onClick={() => handleRemoveImage(image.id)}
                  aria-label={t("comments.removeImage", { number: index + 1 })}
                  className={cn(
                    "absolute top-1 right-1 flex size-6 cursor-pointer items-center justify-center rounded-full",
                    "border bg-background/90 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    "opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100",
                    "hover:bg-destructive hover:text-white",
                  )}
                >
                  <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-2 py-2">
          <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleAddImages} className="hidden" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="cursor-pointer text-muted-foreground"
            onClick={() => fileInputRef.current?.click()}
            disabled={mutation.isPending || images.length >= MAX_PHOTOS}
          >
            <HugeiconsIcon icon={ImageAdd01Icon} className="size-4" />
            <span>
              {t("comments.addImages")}
              {images.length > 0 && ` (${images.length}/${MAX_PHOTOS})`}
            </span>
          </Button>

          <Button type="submit" size="sm" className="cursor-pointer" disabled={isDisabled}>
            {mutation.isPending ? t("common:actions.submitting") : t("comments.postComment")}
            {mutation.isPending && <Spinner data-icon="inline-end" />}
          </Button>
        </div>
      </div>

      {mutation.isError && (
        <p className="text-sm text-destructive">
          {qualityErrorKey
            ? t(`submissions:${qualityErrorKey}`)
            : mutation.error instanceof Error
              ? mutation.error.message
              : t("common:actions.error")}
        </p>
      )}
    </form>
  );
}
