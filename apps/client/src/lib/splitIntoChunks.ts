export function splitIntoChunks<Item>(items: readonly Item[], chunkSize: number): Item[][] {
  const chunks: Item[][] = [];
  for (let start = 0; start < items.length; start += chunkSize) chunks.push(items.slice(start, start + chunkSize));
  return chunks;
}
