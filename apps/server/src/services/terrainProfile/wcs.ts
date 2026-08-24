export const DEFAULT_WCS_FORMAT = "image/x-aaigrid";

export type AaiGrid = {
  columns: number;
  rows: number;
  xllCorner: number;
  yllCorner: number;
  cellWidth: number;
  cellHeight: number;
  noDataValue: number;
  values: number[];
};

export function parseAaiGrid(text: string): AaiGrid {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const headers = new Map<string, number>();
  let dataStart = 0;

  for (let i = 0; i < Math.min(lines.length, 12); i++) {
    const match = /^(ncols|nrows|xllcorner|yllcorner|xllcenter|yllcenter|cellsize|dx|dy|nodata_value)\s+([+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?)$/i.exec(
      lines[i]!,
    );
    if (!match) break;
    headers.set(match[1]!.toLowerCase(), Number(match[2]));
    dataStart = i + 1;
  }

  const columns = headers.get("ncols");
  const rows = headers.get("nrows");
  const cellWidth = headers.get("dx") ?? headers.get("cellsize");
  const cellHeight = headers.get("dy") ?? headers.get("cellsize");
  const xll = headers.get("xllcorner") ?? headers.get("xllcenter");
  const yll = headers.get("yllcorner") ?? headers.get("yllcenter");
  if (
    columns === undefined ||
    rows === undefined ||
    !Number.isInteger(columns) ||
    !Number.isInteger(rows) ||
    columns <= 0 ||
    rows <= 0 ||
    cellWidth === undefined ||
    cellHeight === undefined ||
    cellWidth <= 0 ||
    cellHeight <= 0 ||
    xll === undefined ||
    yll === undefined
  )
    throw new Error("Invalid Arc/Info ASCII grid header");

  const centeredX = headers.has("xllcenter") ? xll - cellWidth / 2 : xll;
  const centeredY = headers.has("yllcenter") ? yll - cellHeight / 2 : yll;
  const values = lines
    .slice(dataStart)
    .flatMap((line) => line.split(/\s+/).map(Number))
    .slice(0, columns * rows);
  if (values.length !== columns * rows || values.some((value) => !Number.isFinite(value))) throw new Error("Invalid Arc/Info ASCII grid values");

  return {
    columns,
    rows,
    xllCorner: centeredX,
    yllCorner: centeredY,
    cellWidth,
    cellHeight,
    noDataValue: headers.get("nodata_value") ?? -9999,
    values,
  };
}
