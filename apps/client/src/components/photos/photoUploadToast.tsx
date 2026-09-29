import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export type PhotoUploadProgress = (sent: number, total: number) => void;

type PhotoUploadMessages = {
  success?: string;
  error: (error: unknown) => string;
};

let uploadCount = 0;

const PHOTO_PROGRESS_CREEP = 0.9;

function PhotoUploadStatus({ sent, total }: { sent: number; total: number }) {
  const { t } = useTranslation("submissions");
  const isComplete = sent >= total;
  const progress = isComplete ? 1 : (sent + PHOTO_PROGRESS_CREEP) / total;

  return (
    <div className="flex w-full flex-col gap-2">
      <span>{t("photos.sending", { current: Math.min(sent + 1, total), total })}</span>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={sent}
        className="h-1 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          data-complete={isComplete}
          className="h-full origin-left scale-x-(--progress) bg-primary transition-[scale] duration-[7s] ease-[cubic-bezier(0.1,0.7,0.2,1)] starting:scale-x-0 data-[complete=true]:duration-300 motion-reduce:transition-none"
          style={{ "--progress": progress } as React.CSSProperties}
        />
      </div>
    </div>
  );
}

export async function trackPhotoUpload<T>(upload: (onProgress: PhotoUploadProgress) => Promise<T>, messages: PhotoUploadMessages): Promise<T> {
  uploadCount += 1;
  const id = `photo-upload-${uploadCount}`;
  try {
    const result = await upload((sent, total) => {
      toast.loading(<PhotoUploadStatus sent={sent} total={total} />, { id });
    });
    if (messages.success) toast.success(messages.success, { id });
    else toast.dismiss(id);
    return result;
  } catch (error) {
    toast.error(messages.error(error), { id });
    throw error;
  }
}
