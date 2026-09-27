import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export type PhotoUploadProgress = (sent: number, total: number) => void;

type PhotoUploadMessages = {
  success?: string;
  error: (error: unknown) => string;
};

let uploadCount = 0;

function PhotoUploadStatus({ sent, total }: { sent: number; total: number }) {
  const { t } = useTranslation("submissions");

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
        <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${(sent / total) * 100}%` }} />
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
