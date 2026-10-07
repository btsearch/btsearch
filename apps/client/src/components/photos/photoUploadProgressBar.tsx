import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";

import { photoUploadProgressStore } from "./photoUploadProgress";
import { cn } from "@/lib/utils";

export function PhotoUploadProgressBar(): React.JSX.Element | null {
  const progress = useSyncExternalStore(
    photoUploadProgressStore.subscribe,
    photoUploadProgressStore.getSnapshot,
    photoUploadProgressStore.getServerSnapshot,
  );
  const { t } = useTranslation("submissions");
  if (progress === null) return null;

  const isIndeterminate = progress.hasUnknownTotal || progress.total === 0 || progress.sent === 0;

  return (
    <div
      role="progressbar"
      aria-label={t("photos.uploading")}
      aria-valuemin={isIndeterminate ? undefined : 0}
      aria-valuemax={isIndeterminate ? undefined : progress.total}
      aria-valuenow={isIndeterminate ? undefined : progress.sent}
      className="pointer-events-none fixed inset-x-0 top-[env(safe-area-inset-top,0px)] z-100 h-0.5 overflow-hidden bg-primary/15"
    >
      <div
        className={cn(
          "h-full bg-primary",
          isIndeterminate
            ? "w-1/3 animate-pulse motion-reduce:animate-none"
            : "w-full origin-left transition-transform duration-300 motion-reduce:transition-none",
        )}
        style={isIndeterminate ? undefined : { transform: `scaleX(${progress.sent / progress.total})` }}
      />
    </div>
  );
}
