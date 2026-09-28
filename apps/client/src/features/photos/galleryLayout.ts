import { useCallback, useState } from "react";

const TILE_GAP = 12;
const COLUMN_GAP = 24;
const MIN_TILE_SIZE = 186;
const WIDE_MIN_TILE_SIZE = 210;
const WIDE_GALLERY_WIDTH = 1472;

export type GalleryLayout = { columns: 1 | 2; tracks: number };

const INITIAL_LAYOUT: GalleryLayout = { columns: 1, tracks: 1 };

function countTracks(width: number, minTileSize: number) {
  return Math.max(1, Math.floor((width + TILE_GAP) / (minTileSize + TILE_GAP)));
}

function getGalleryLayout(width: number): GalleryLayout {
  const minTileSize = width >= WIDE_GALLERY_WIDTH ? WIDE_MIN_TILE_SIZE : MIN_TILE_SIZE;
  const columnTracks = countTracks((width - COLUMN_GAP) / 2, minTileSize);
  if (columnTracks >= 2) return { columns: 2, tracks: columnTracks };
  return { columns: 1, tracks: countTracks(width, minTileSize) };
}

export function getGroupLayout(photoCount: number, { columns, tracks }: GalleryLayout) {
  if (columns === 2 && photoCount > tracks) return { fullRow: true, tracks: tracks * 2 };
  if (tracks === 1 && photoCount === 2) return { fullRow: false, tracks: 2 };
  return { fullRow: false, tracks };
}

export function useGalleryLayout() {
  const [layout, setLayout] = useState(INITIAL_LAYOUT);

  const galleryRef = useCallback((node: HTMLDivElement) => {
    const measure = () => {
      const next = getGalleryLayout(node.clientWidth);
      setLayout((current) => (current.columns === next.columns && current.tracks === next.tracks ? current : next));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { galleryRef, layout };
}
