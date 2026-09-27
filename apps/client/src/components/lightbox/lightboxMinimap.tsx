import { AnimatePresence, clamp, motion, useTransform } from "motion/react";

import type { Size } from "./types";
import type { ZoomController } from "./useZoomPan";

function visibleRange(offset: number, stageLength: number, displayLength: number) {
  const length = Math.max(1, displayLength);
  const start = clamp(0, 1, (-stageLength / 2 - offset) / length + 0.5);
  const end = clamp(0, 1, (stageLength / 2 - offset) / length + 0.5);
  return { start, size: end - start };
}

type Props = {
  src: string;
  visible: boolean;
  fitSize: Size;
  stageSize: Size;
  zoom: ZoomController;
  compact: boolean;
};

export function LightboxMinimap({ src, visible, fitSize, stageSize, zoom, compact }: Props) {
  const width = compact ? 88 : 128;
  const height = fitSize.width > 0 ? (width * fitSize.height) / fitSize.width : 0;
  const rangeX = () => visibleRange(zoom.x.get(), stageSize.width, fitSize.width * zoom.scale.get());
  const rangeY = () => visibleRange(zoom.y.get(), stageSize.height, fitSize.height * zoom.scale.get());
  const left = useTransform(() => rangeX().start * width);
  const top = useTransform(() => rangeY().start * height);
  const rectWidth = useTransform(() => rangeX().size * width);
  const rectHeight = useTransform(() => rangeY().size * height);

  return (
    <AnimatePresence>
      {visible && height > 0 ? (
        <motion.div
          key="minimap"
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="pointer-events-none absolute right-4 z-10 overflow-hidden rounded-md shadow-lg ring-1 ring-white/25 max-md:top-16 md:bottom-4"
          style={{ width, height }}
        >
          <img src={src} alt="" draggable={false} className="size-full object-cover opacity-70" />
          <motion.div
            className="absolute rounded-[3px] border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]"
            style={{ left, top, width: rectWidth, height: rectHeight }}
          />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
