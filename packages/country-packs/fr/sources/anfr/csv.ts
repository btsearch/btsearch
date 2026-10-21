const QUOTE = '"';

function separatorOf(headerLine: string): string {
  const semicolons = headerLine.split(";").length;
  const commas = headerLine.split(",").length;
  return semicolons >= commas ? ";" : ",";
}

export async function* readCsvRows(chunks: AsyncIterable<Uint8Array>): AsyncGenerator<string[]> {
  const decoder = new TextDecoder("utf-8");
  let separator: string | null = null;
  let beforeFirstLineEnd = "";
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let quoteSeen = false;

  function* consume(text: string): Generator<string[]> {
    for (const char of text) {
      if (quoteSeen) {
        quoteSeen = false;
        if (char === QUOTE) {
          field += QUOTE;
          continue;
        }
        inQuotes = false;
      }
      if (inQuotes) {
        if (char === QUOTE) quoteSeen = true;
        else field += char;
      } else if (char === QUOTE && field === "") {
        inQuotes = true;
      } else if (char === separator) {
        row.push(field);
        field = "";
      } else if (char === "\n") {
        row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
        yield row;
        row = [];
        field = "";
      } else {
        field += char;
      }
    }
  }

  for await (const chunk of chunks) {
    const text = decoder.decode(chunk, { stream: true });
    if (separator !== null) {
      yield* consume(text);
      continue;
    }

    beforeFirstLineEnd += text;
    const lineEnd = beforeFirstLineEnd.indexOf("\n");
    if (lineEnd < 0) continue;
    separator = separatorOf(beforeFirstLineEnd.slice(0, lineEnd));
    yield* consume(beforeFirstLineEnd);
  }

  if (separator === null) {
    separator = separatorOf(beforeFirstLineEnd);
    yield* consume(beforeFirstLineEnd);
  }
  yield* consume(decoder.decode());
  if (field !== "" || row.length > 0) {
    row.push(field);
    yield row;
  }
}
