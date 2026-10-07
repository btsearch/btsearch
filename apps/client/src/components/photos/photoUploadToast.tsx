import { toast } from "sonner";

import { photoUploadProgressStore } from "./photoUploadProgress";

export type PhotoUploadProgress = (sent: number, total: number) => void;

type PhotoUploadMessages = {
  success?: string;
  error: (error: unknown) => string;
};

let uploadCount = 0;

export async function trackPhotoUpload<T>(upload: (onProgress: PhotoUploadProgress) => Promise<T>, messages: PhotoUploadMessages): Promise<T> {
  uploadCount += 1;
  const id = `photo-upload-${uploadCount}`;
  try {
    photoUploadProgressStore.start(id);
    const result = await upload((sent, total) => {
      photoUploadProgressStore.update(id, sent, total);
    });
    if (messages.success) toast.success(messages.success, { id });
    else toast.dismiss(id);
    return result;
  } catch (error) {
    toast.error(messages.error(error), { id });
    throw error;
  } finally {
    photoUploadProgressStore.finish(id);
  }
}
