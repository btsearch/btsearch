export function hasCoarsePointer() {
  return window.matchMedia("(any-pointer: coarse)").matches;
}

export function hasReliableHoverPointer() {
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}
