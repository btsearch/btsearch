import { Cancel01Icon, Image01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { stationPhotoRecordsQueryOptions } from "../../api";
import { isMainPhoto } from "./stationPhotos";
import { PhotoWithFallback } from "@/components/photos/photoGridPrimitives";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePreferences } from "@/hooks/usePreferences";
import { cn } from "@/lib/utils";

const PLACEMENT_CLASS = "pointer-events-none absolute top-0 left-full hidden h-full max-h-[calc(100dvh-2rem)] pl-3 xl:flex";
const PANE_CLASS = "pointer-events-auto relative h-full w-80 shrink-0 overflow-hidden rounded-2xl bg-muted shadow-2xl";
const PANE_SWAP_CLASS = "transition-[opacity,translate] duration-200 ease-out motion-reduce:transition-none";
const PANE_HIDDEN_CLASS = "pointer-events-none -translate-x-2 opacity-0";
const HANDLE_CLASS = "pointer-events-auto absolute top-0 left-3";
const HANDLE_SWAP_CLASS = "transition-[opacity,scale] duration-200 ease-out motion-reduce:transition-none";
const HANDLE_HIDDEN_CLASS = "pointer-events-none scale-75 opacity-0";
const PHOTO_BUTTON_CLASS = cn(
  "group absolute inset-0 cursor-pointer outline-none",
  "after:pointer-events-none after:absolute after:inset-0 after:rounded-2xl after:content-['']",
  "focus-visible:after:ring-3 focus-visible:after:ring-ring focus-visible:after:ring-inset",
);
const HIDE_BUTTON_CLASS = cn(
  "absolute top-2 right-2 cursor-pointer rounded-full bg-black/60 text-white",
  "hover:bg-black/80 hover:text-white focus-visible:ring-white/70 dark:hover:bg-black/80",
);
const SHOW_BUTTON_CLASS =
  "cursor-pointer rounded-lg border-border/70 text-muted-foreground shadow-lg dark:border-border/70 dark:bg-background dark:hover:bg-muted";

type StationPhotoPaneProps = {
  stationId: number;
  onOpenPhotos: () => void;
};

export function StationPhotoPane({ stationId, onOpenPhotos }: StationPhotoPaneProps) {
  const { t } = useTranslation(["stationDetails", "common"]);
  const { preferences, updatePreferences } = usePreferences();
  const { data: photos } = useQuery({ ...stationPhotoRecordsQueryOptions(stationId), placeholderData: keepPreviousData });
  const hideButtonRef = useRef<HTMLButtonElement>(null);
  const showButtonRef = useRef<HTMLButtonElement>(null);
  const [renderedPhotoUrl, setRenderedPhotoUrl] = useState<string | null>(null);

  const isPaneShown = preferences.showStationPhotoPanel;

  function setPaneShown(isShown: boolean, pressedButton: HTMLElement) {
    const nextButtonRef = isShown ? hideButtonRef : showButtonRef;
    const hadFocus = pressedButton === document.activeElement;
    updatePreferences({ showStationPhotoPanel: isShown });
    if (hadFocus) requestAnimationFrame(() => nextButtonRef.current?.focus());
  }

  if (photos === undefined || photos.length === 0) return null;

  const mainPhoto = photos.find((photo) => isMainPhoto(photo, stationId)) ?? photos[0];
  const mainPhotoUrl = mainPhoto.urls.display;
  const paneImageUrl = isPaneShown || renderedPhotoUrl === mainPhotoUrl ? mainPhotoUrl : null;
  if (renderedPhotoUrl !== paneImageUrl) setRenderedPhotoUrl(paneImageUrl);

  const hideLabel = t("photos.hidePanel");
  const showLabel = t("photos.showPanel");

  return (
    <div className={PLACEMENT_CLASS}>
      <div inert={!isPaneShown} className={cn(PANE_CLASS, PANE_SWAP_CLASS, !isPaneShown && PANE_HIDDEN_CLASS)}>
        <button type="button" onClick={onOpenPhotos} aria-label={t("common:photos.stationPhotos")} className={PHOTO_BUTTON_CLASS}>
          {paneImageUrl === null ? null : (
            <PhotoWithFallback
              src={paneImageUrl}
              alt=""
              loading="lazy"
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
              fallbackClassName="group-hover:scale-100"
            />
          )}
          {photos.length > 1 ? (
            <span className="absolute bottom-3 right-3 flex items-center gap-1 bg-black/60 text-white text-xs px-2 py-1 rounded-full font-medium">
              <HugeiconsIcon icon={Image01Icon} className="size-3" aria-hidden="true" />
              {photos.length}
            </span>
          ) : null}
        </button>
        <Tooltip>
          <TooltipTrigger
            ref={hideButtonRef}
            aria-label={hideLabel}
            render={<Button type="button" variant="ghost" size="icon-sm" className={HIDE_BUTTON_CLASS} />}
            onClick={(event) => setPaneShown(false, event.currentTarget)}
          >
            <HugeiconsIcon icon={Cancel01Icon} aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent>{hideLabel}</TooltipContent>
        </Tooltip>
      </div>
      <div inert={isPaneShown} className={cn(HANDLE_CLASS, HANDLE_SWAP_CLASS, isPaneShown && HANDLE_HIDDEN_CLASS)}>
        <Tooltip>
          <TooltipTrigger
            ref={showButtonRef}
            aria-label={showLabel}
            render={<Button type="button" variant="outline" size="icon-sm" className={SHOW_BUTTON_CLASS} />}
            onClick={(event) => setPaneShown(true, event.currentTarget)}
          >
            <HugeiconsIcon icon={Image01Icon} aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent>{showLabel}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
