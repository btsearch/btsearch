import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import "react-image-crop/dist/ReactCrop.css";
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from "react-image-crop";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

function centerSquareCrop(mediaWidth: number, mediaHeight: number): Crop {
  return centerCrop(makeAspectCrop({ unit: "%", width: 90 }, 1, mediaWidth, mediaHeight), mediaWidth, mediaHeight);
}

async function getCroppedBlob(image: HTMLImageElement, crop: PixelCrop): Promise<Blob> {
  const canvas = document.createElement("canvas");
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;
  canvas.width = crop.width;
  canvas.height = crop.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas context");
  ctx.drawImage(image, crop.x * scaleX, crop.y * scaleY, crop.width * scaleX, crop.height * scaleY, 0, 0, crop.width, crop.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Failed to create blob"))), "image/jpeg", 0.95);
  });
}

type Props = {
  open: boolean;
  src: string;
  onConfirm: (blob: Blob) => void;
  onClose: () => void;
};

export function AvatarCropDialog({ open, src, onConfirm, onClose }: Props) {
  const { t } = useTranslation("settings");
  const imgRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [isProcessing, setIsProcessing] = useState(false);

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { width, height } = e.currentTarget;
    setCrop(centerSquareCrop(width, height));
  }

  const handleConfirm = useCallback(async () => {
    if (!imgRef.current || !completedCrop) return;
    setIsProcessing(true);
    try {
      const blob = await getCroppedBlob(imgRef.current, completedCrop);
      onConfirm(blob);
    } finally {
      setIsProcessing(false);
    }
  }, [completedCrop, onConfirm]);

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) onClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t("account.avatar.cropTitle")}</DialogTitle>
        </DialogHeader>

        <div className="flex justify-center overflow-hidden rounded-lg bg-muted/50">
          <ReactCrop crop={crop} onChange={setCrop} onComplete={setCompletedCrop} aspect={1} circularCrop keepSelection className="max-h-72">
            <img ref={imgRef} src={src} onLoad={onImageLoad} className="max-h-72 max-w-full object-contain" alt="" />
          </ReactCrop>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isProcessing}>
            {t("common:actions.cancel")}
          </Button>
          <Button onClick={handleConfirm} disabled={!completedCrop || isProcessing}>
            {isProcessing ? <Spinner className="size-3.5" /> : null}
            {t(isProcessing ? "account.avatar.uploading" : "account.avatar.cropConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
