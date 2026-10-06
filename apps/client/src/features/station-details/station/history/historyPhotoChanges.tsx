import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { HistoryChangeValue } from "./historyChangeLines";
import { describePhotoChanges, getShortPhotoId } from "./photoChanges";
import type { HistoryPhotoMark } from "./photoChanges";
import type { HistoryPhotosPart } from "./types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type HistoryPhotoChangesProps = { part: HistoryPhotosPart };

function HistoryPhotoReference({ photo, isMain }: HistoryPhotoMark) {
  const { t } = useTranslation("stationDetails");
  const [previewFailed, setPreviewFailed] = useState(false);

  if (photo.id === null || photo.urls === null) {
    return <span>{isMain ? t("history.values.mainPhotoUnavailable") : t("common:photoUnavailable")}</span>;
  }

  const id = getShortPhotoId(photo.id);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <a
            href={photo.urls.display}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 rounded-sm underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-1"
            aria-label={t("history.values.openPhoto", { id })}
          />
        }
      >
        {t(isMain ? "history.values.mainPhotoReference" : "history.values.photoReference", { id })}
        <HugeiconsIcon icon={ArrowUpRight01Icon} className="size-3 shrink-0" aria-hidden />
      </TooltipTrigger>
      <TooltipContent className="max-w-none p-1">
        {previewFailed ? (
          <span className="block px-2 py-1">{t("history.values.photoPreviewFailed", { id })}</span>
        ) : (
          <img
            src={photo.urls.thumb}
            alt={t("history.values.photoPreviewAlt", { id })}
            width={160}
            height={112}
            loading="lazy"
            decoding="async"
            className="h-28 w-40 rounded-sm object-cover"
            onError={() => setPreviewFailed(true)}
          />
        )}
      </TooltipContent>
    </Tooltip>
  );
}

export function HistoryPhotoChanges({ part }: HistoryPhotoChangesProps) {
  const lines = describePhotoChanges(part);

  return (
    <div className="text-xs leading-6 text-muted-foreground wrap-break-word">
      {lines.map((line) => (
        <p key={line.key}>
          <HistoryChangeValue
            from={line.from === null ? null : <HistoryPhotoReference photo={line.from.photo} isMain={line.from.isMain} />}
            to={line.to === null ? null : <HistoryPhotoReference photo={line.to.photo} isMain={line.to.isMain} />}
          />
        </p>
      ))}
    </div>
  );
}
