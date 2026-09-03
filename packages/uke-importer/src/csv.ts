export function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (inQuotes) {
      if (character === '"' && nextCharacter === '"') {
        currentCell += '"';
        index++;
      } else if (character === '"') inQuotes = false;
      else currentCell += character;
    } else if (character === '"') inQuotes = true;
    else if (character === ",") {
      cells.push(currentCell);
      currentCell = "";
    } else currentCell += character;
  }

  cells.push(currentCell);
  return cells;
}
