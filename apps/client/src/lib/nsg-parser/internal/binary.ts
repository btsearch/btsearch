export function hasByteRange(offset: number, size: number, limit: number): boolean {
  return offset >= 0 && size >= 0 && offset <= limit - size;
}
