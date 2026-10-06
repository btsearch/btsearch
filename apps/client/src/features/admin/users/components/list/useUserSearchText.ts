import { useState } from "react";

import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";

const SEARCH_DEBOUNCE_MS = 300;

export function useUserSearchText(query: string, onQueryChange: (query: string) => void) {
  const [text, setText] = useState(query);
  const [sentQuery, setSentQuery] = useState(query);
  const [seenQuery, setSeenQuery] = useState(query);

  if (seenQuery !== query) {
    setSeenQuery(query);
    if (query !== sentQuery) {
      setSentQuery(query);
      setText(query);
    }
  }

  function sendQuery(nextQuery: string) {
    if (nextQuery === sentQuery) return;
    setSentQuery(nextQuery);
    onQueryChange(nextQuery);
  }

  const sendTextLater = useDebouncedCallback(() => sendQuery(text.trim()), SEARCH_DEBOUNCE_MS);

  function changeText(nextText: string) {
    setText(nextText);
    if (nextText.trim() === "") sendQuery("");
    else sendTextLater();
  }

  function clearText() {
    setText("");
    setSentQuery("");
  }

  return { text, changeText, clearText };
}
