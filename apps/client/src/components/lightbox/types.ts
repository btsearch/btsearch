import type { ReactNode } from "react";

export type LightboxSlide = {
  key: string;
  src: string;
  alt: string;
  caption?: ReactNode;
  details?: ReactNode;
  downloadName?: string;
};

export type LightboxProps = {
  slides: LightboxSlide[];
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  loop?: boolean;
  title?: ReactNode;
  actions?: (slide: LightboxSlide, index: number) => ReactNode;
  getTrigger?: (index: number) => HTMLElement | null;
};

export type Size = { width: number; height: number };
