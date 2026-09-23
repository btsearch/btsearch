import { Cancel01Icon, ImageAdd01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ChangeEvent, type ClipboardEvent, type DragEvent, type SubmitEvent, useCallback, useEffect, useId, useRef, useState } from "react";
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

function revokePreviewUrls(images: ImagePreview[]) {
  for (const image of images) URL.revokeObjectURL(image.previewUrl);
}

export function AddCommentForm({ stationId }: AddCommentFormProps) {
  const { t } = useTranslation(["stationDetails", "submissions"]);
  const [content, setContent] = useState("");
  const [images, setImages] = useState<ImagePreview[]>([]);
  const imagesRef = useRef<ImagePreview[]>([]);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const contentId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  useEffect(
    () => () => {
      revokePreviewUrls(imagesRef.current);
      imagesRef.current = [];
    },
    [],
  );

  const mutation = useMutation({
    mutationFn: ({ content, files }: { content: string; files: File[] }) => postComment(stationId, content, files),
    onSuccess: (res: { data: { status: "pending" | "approved" } }) => {
      setContent("");
      revokePreviewUrls(imagesRef.current);
      imagesRef.current = [];
      setImages([]);
      if (res.data.status === "pending") toast.info(t("comments.pendingApproval"));
      void queryClient.invalidateQueries({ queryKey: ["station-comments", stationId] });
    },
  });

  const addImages = useCallback((files: File[]) => {
    const filesToAdd = files.filter((file) => file.type.startsWith("image/")).slice(0, MAX_PHOTOS - imagesRef.current.length);
    if (filesToAdd.length === 0) return;

    const newImages: ImagePreview[] = filesToAdd.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    const nextImages = [...imagesRef.current, ...newImages];
    imagesRef.current = nextImages;
    setImages(nextImages);
  }, []);

  const handleAddImages = (e: ChangeEvent<HTMLInputElement>) => {
    addImages(Array.from(e.target.files ?? []));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardFiles = Array.from(e.clipboardData.files);
    const files =
      clipboardFiles.length > 0
        ? clipboardFiles
        : Array.from(e.clipboardData.items, (item) => item.getAsFile()).filter((file): file is File => file !== null);
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) return;

    if (!e.clipboardData.getData("text/plain")) e.preventDefault();
    if (!mutation.isPending) addImages(imageFiles);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes("Files")) return;

    e.preventDefault();
    const canAddImages = !mutation.isPending && images.length < MAX_PHOTOS;
    e.dataTransfer.dropEffect = canAddImages ? "copy" : "none";
    setIsDraggingFile(canAddImages);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget)) setIsDraggingFile(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    setIsDraggingFile(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    e.preventDefault();
    if (!mutation.isPending) addImages(files);
  };

  const handleRemoveImage = useCallback((id: string) => {
    const removed = imagesRef.current.find((image) => image.id === id);
    if (!removed) return;

    const nextImages = imagesRef.current.filter((image) => image.id !== id);
    imagesRef.current = nextImages;
    setImages(nextImages);
    URL.revokeObjectURL(removed.previewUrl);
  }, []);

  const handleSubmit = (e: SubmitEvent) => {
    e.preventDefault();
    const files = imagesRef.current.map((image) => image.file);
    if (!content.trim() && files.length === 0) return;
    mutation.mutate({ content, files });
  };

  const isDisabled = mutation.isPending || (!content.trim() && images.length === 0);
  const qualityErrorKey = photoQualityErrorKey(mutation.error);

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <label htmlFor={contentId} className="sr-only">
        {t("comments.addComment")}
      </label>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "overflow-hidden rounded-xl border border-input bg-background transition-colors focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/20",
          isDraggingFile && "border-ring ring-[3px] ring-ring/50",
        )}
      >
        <Textarea
          id={contentId}
          placeholder={t("comments.placeholder")}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onPaste={handlePaste}
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
