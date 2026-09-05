import { ArrowLeft01Icon, ArrowRight01Icon, Camera01Icon, Cancel01Icon, Upload04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { PhotoWithFallback } from "@/components/photos/photoGridPrimitives";
import { Spinner } from "@/components/ui/spinner";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { cn } from "@/lib/utils";

const DATE_FORMAT: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" };
const MONTH_FORMAT: Intl.DateTimeFormatOptions = { year: "numeric", month: "short" };
const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export type LightboxPhoto = {
  attachment_uuid: string;
  note: string | null;
  taken_at?: string | null;
  createdAt: string;
  author: { uuid: string; username: string; name: string } | null;
};

type Props = {
  photos: LightboxPhoto[];
  index: number | null;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
};

type NavigationDirection = "left" | "right";

export function Lightbox({ photos, index, onClose, onPrev, onNext }: Props) {
  const { t, i18n } = useTranslation(["stationDetails", "common"]);
  const [imgAnimClass, setImgAnimClass] = useState("opacity-0");
  const [failedAttachmentUuid, setFailedAttachmentUuid] = useState<string | null>(null);
  const loadedUuids = useRef<Set<string>>(new Set());
  const dialogRef = useRef<HTMLDivElement>(null);
  const navigationDirectionRef = useRef<NavigationDirection | null>(null);

  const activePhoto = index !== null ? (photos[index] ?? null) : null;
  const isOpen = activePhoto !== null;
  const hasMultiplePhotos = photos.length > 1;

  function closeLightbox() {
    setFailedAttachmentUuid(null);
    onClose();
  }

  function navigate(direction: NavigationDirection) {
    setFailedAttachmentUuid(null);
    navigationDirectionRef.current = direction;
    if (direction === "left") onPrev();
    else onNext();
  }

  const handleArrowKey = useEffectEvent((event: KeyboardEvent) => {
    if (!hasMultiplePhotos) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      navigate("left");
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      navigate("right");
    }
  });

  useEscapeKey(closeLightbox, isOpen);

  useEffect(() => {
    if (!isOpen) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const siblingStates = Array.from(document.body.children)
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== dialog)
      .map((element) => ({ element, inert: element.inert }));

    for (const { element } of siblingStates) element.inert = true;

    const getFocusableElements = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => element.getClientRects().length > 0);
    const focusFrame = requestAnimationFrame(() => (getFocusableElements()[0] ?? dialog).focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      handleArrowKey(event);
      if (event.key !== "Tab") return;
      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;
      if (event.shiftKey && (activeElement === firstElement || !dialog.contains(activeElement))) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && (activeElement === lastElement || !dialog.contains(activeElement))) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    dialog.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelAnimationFrame(focusFrame);
      dialog.removeEventListener("keydown", handleKeyDown);
      for (const { element, inert } of siblingStates) element.inert = inert;
      previousFocus?.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!activePhoto?.attachment_uuid) return;
    if (!loadedUuids.current.has(activePhoto.attachment_uuid)) setImgAnimClass("opacity-0");
  }, [activePhoto?.attachment_uuid]);

  function handleImgLoad() {
    if (activePhoto) loadedUuids.current.add(activePhoto.attachment_uuid);
    setFailedAttachmentUuid(null);
    const navigationDirection = navigationDirectionRef.current;
    navigationDirectionRef.current = null;
    const slide = navigationDirection === "left" ? " slide-in-from-left-8" : navigationDirection === "right" ? " slide-in-from-right-8" : "";
    setImgAnimClass(`animate-in fade-in${slide} duration-200`);
  }

  if (index === null || !activePhoto) return null;

  const username = activePhoto.author?.username.trim();
  const photoAlt = activePhoto.note?.trim() || t("photos.photoAlt", { number: index + 1 });
  const uploadedDate = new Date(activePhoto.createdAt).toLocaleDateString(i18n.language, DATE_FORMAT);
  const takenDate = activePhoto.taken_at ? new Date(activePhoto.taken_at).toLocaleDateString(i18n.language, MONTH_FORMAT) : null;
  const imageFailed = failedAttachmentUuid === activePhoto.attachment_uuid;

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={t("photos.viewerLabel")}
      tabIndex={-1}
      className="fixed inset-0 z-200 flex animate-in items-center justify-center fade-in duration-200"
    >
      <div className="absolute inset-0 bg-black/90 cursor-pointer" onClick={closeLightbox} />

      <button
        type="button"
        className="absolute top-3 right-3 z-10 p-2 text-white hover:bg-white/10 active:bg-white/20 active:scale-95 rounded-full transition-[colors,transform]"
        aria-label={t("common:actions.close")}
        onClick={closeLightbox}
      >
        <HugeiconsIcon icon={Cancel01Icon} className="size-5" />
      </button>

      {photos.length > 1 ? (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-black/50 text-white/80 text-xs tabular-nums px-3 py-1 rounded-full select-none pointer-events-none">
          {index + 1} / {photos.length}
        </div>
      ) : null}

      {photos.length > 1 ? (
        <>
          <button
            type="button"
            className="hidden md:block absolute left-3 top-1/2 -translate-y-1/2 z-10 p-3 text-white hover:bg-white/10 active:bg-white/20 active:scale-95 rounded-full transition-[colors,transform]"
            aria-label={t("photos.previousPhoto")}
            onClick={() => navigate("left")}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} className="size-6" />
          </button>
          <button
            type="button"
            className="hidden md:block absolute right-3 top-1/2 -translate-y-1/2 z-10 p-3 text-white hover:bg-white/10 active:bg-white/20 active:scale-95 rounded-full transition-[colors,transform]"
            aria-label={t("photos.nextPhoto")}
            onClick={() => navigate("right")}
          >
            <HugeiconsIcon icon={ArrowRight01Icon} className="size-6" />
          </button>
        </>
      ) : null}

      <div className="relative z-10 flex flex-col items-center gap-3 max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div
          className="relative flex items-center justify-center min-w-16 min-h-16"
          onClick={(e) => {
            if (photos.length <= 1) return;
            if (!window.matchMedia("(pointer: coarse)").matches) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width;
            if (x < 0.33) navigate("left");
            else if (x > 0.67) navigate("right");
          }}
        >
          {!imageFailed && imgAnimClass === "opacity-0" ? <Spinner className="absolute text-white/60 size-6" /> : null}
          <PhotoWithFallback
            key={activePhoto.attachment_uuid}
            src={`/uploads/${activePhoto.attachment_uuid}.webp`}
            alt={photoAlt}
            className={cn("max-w-full max-h-[calc(90vh-4rem)] object-contain rounded-lg", imgAnimClass)}
            fallbackClassName="min-h-40 min-w-64 bg-white/5 px-6 text-white/70 opacity-100"
            onLoad={handleImgLoad}
            onError={() => setFailedAttachmentUuid(activePhoto.attachment_uuid)}
          />
        </div>
        <div className="flex flex-col items-center gap-1 text-white/80 text-xs">
          <div className="flex items-center gap-2.5">
            <span className="font-medium">{username ? `@${username}` : t("photos.unknownUser")}</span>
            <div className="flex items-center gap-1.5">
              <HugeiconsIcon icon={Upload04Icon} className="size-3 opacity-60" aria-hidden="true" />
              <span className="sr-only">{t("photos.uploadedAt")}: </span>
              <time dateTime={activePhoto.createdAt} className="tabular-nums">
                {uploadedDate}
              </time>
            </div>
            {activePhoto.taken_at && takenDate ? (
              <div className="flex items-center gap-1.5">
                <HugeiconsIcon icon={Camera01Icon} className="size-3 opacity-60" aria-hidden="true" />
                <span className="sr-only">{t("photos.takenAt")}: </span>
                <time dateTime={activePhoto.taken_at} className="tabular-nums">
                  {takenDate}
                </time>
              </div>
            ) : null}
          </div>
          {activePhoto.note ? <span className="italic text-white/60">{activePhoto.note}</span> : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
