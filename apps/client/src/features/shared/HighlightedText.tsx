type HighlightedTextProps = {
  text: string;
  query: string;
};

export function HighlightedText({ text, query }: HighlightedTextProps) {
  const start = query === "" ? -1 : text.toLocaleLowerCase().indexOf(query);
  if (start === -1) return text;

  const end = start + query.length;
  return (
    <>
      {text.slice(0, start)}
      <mark className="-mx-0.5 rounded-[3px] bg-primary/30 px-0.5 font-semibold text-foreground dark:bg-primary/50">{text.slice(start, end)}</mark>
      {text.slice(end)}
    </>
  );
}
