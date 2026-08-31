type CellOperation = "add" | "update" | "delete" | "unchanged";

export function countCellOperations(cells: readonly { operation: CellOperation }[]): { added: number; modified: number; deleted: number } {
  const counts = { added: 0, modified: 0, deleted: 0 };
  for (const cell of cells) {
    switch (cell.operation) {
      case "add":
        counts.added += 1;
        break;
      case "update":
        counts.modified += 1;
        break;
      case "delete":
        counts.deleted += 1;
        break;
    }
  }
  return counts;
}
