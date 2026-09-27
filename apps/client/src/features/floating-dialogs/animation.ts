const ENTER_TRANSITION = { duration: 0.15, ease: "easeOut" } as const;
const EXIT_TRANSITION = { duration: 0.1, ease: "easeIn" } as const;

export const FLOATING_DIALOG_FADE_MOTION = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0, transition: EXIT_TRANSITION },
  transition: ENTER_TRANSITION,
} as const;

export const FLOATING_DIALOG_SCALE_MOTION = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.96, transition: EXIT_TRANSITION },
  transition: ENTER_TRANSITION,
} as const;
