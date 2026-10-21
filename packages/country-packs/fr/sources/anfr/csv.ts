const QUOTE = '"';
const SEPARATOR = ";";

export async function* readCsvRows(chunks: AsyncIterable<Uint8Array>): AsyncGenerator<string[]> {
  const decoder = new TextDecoder("utf-8", { fatal: true });
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
      } else if (char === SEPARATOR) {
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

  for await (const chunk of chunks) yield* consume(decoder.decode(chunk, { stream: true }));
  yield* consume(decoder.decode());
  if (field !== "" || row.length > 0) {
    row.push(field);
    yield row;
  }
}
