import { useState } from "react";

import { normalizeSearchText } from "@/lib/apiValues";

type ListSearchText = {
  text: string;
  changeText: (text: string) => void;
};

const NO_PUBLISHED_TEXTS: readonly string[] = [];

export function useListSearchText(searchText: string, onSearchTextChange: (searchText: string) => void): ListSearchText {
  const [text, setText] = useState(searchText);
  const [seenSearchText, setSeenSearchText] = useState(searchText);
  const [publishedTexts, setPublishedTexts] = useState(NO_PUBLISHED_TEXTS);

  if (searchText !== seenSearchText) {
    const publishedIndex = publishedTexts.indexOf(searchText);
    setSeenSearchText(searchText);
    setPublishedTexts(publishedIndex === -1 ? NO_PUBLISHED_TEXTS : publishedTexts.slice(publishedIndex + 1));
    if (publishedIndex === -1 && normalizeSearchText(text) !== searchText) setText(searchText);
  }

  function changeText(nextText: string) {
    const nextSearchText = normalizeSearchText(nextText);
    setText(nextText);
    if (nextSearchText === (publishedTexts.at(-1) ?? searchText)) return;

    setPublishedTexts([...publishedTexts, nextSearchText]);
    onSearchTextChange(nextSearchText);
  }

  return { text, changeText };
}
