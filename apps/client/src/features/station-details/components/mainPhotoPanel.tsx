import { Image01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";

import { PhotoWithFallback } from "@/components/photoGridPrimitives";

import { fetchStationPhotos } from "../api";

type Props = { stationId: number; onOpenPhotoTab: () => void };

export function MainPhotoPanel({ stationId, onOpenPhotoTab }: Props) {
  const { data: photos } = useQuery({
    queryKey: ["station-photos", stationId],
    queryFn: () => fetchStationPhotos(stationId),
    staleTime: 1000 * 60 * 5,
  });

  const mainPhoto = photos?.find((p) => p.is_main) ?? photos?.[0];

  if (!mainPhoto) return null;

  return (
    <button
      type="button"
      onClick={onOpenPhotoTab}
      aria-label="Open photos"
      className="flex w-80 h-full rounded-2xl overflow-hidden shadow-2xl bg-muted relative group focus:outline-none"
    >
      <PhotoWithFallback
        src={`/uploads/${mainPhoto.attachment_uuid}.webp`}
        alt=""
        className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
        fallbackClassName="group-hover:scale-100"
      />
      {photos && photos.length > 1 && (
        <span className="absolute bottom-3 right-3 flex items-center gap-1 bg-black/60 text-white text-xs px-2 py-1 rounded-full font-medium">
          <HugeiconsIcon icon={Image01Icon} className="size-3" />
          {photos.length}
        </span>
      )}
    </button>
  );
}
