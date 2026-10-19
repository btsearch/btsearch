export type ParsedFilter = {
  key: string;
  value: string;
  raw: string;
};

export type FilterValueKind = "choice" | "boolean" | "operator" | "country" | "region" | "band" | "date" | "gps" | "number" | "text";

export type FilterChoice = {
  value: string;
  labelKey?: string;
  tag?: string;
  aliases?: readonly string[];
};

export type FilterKeyword = {
  key: string;
  descriptionKey: string;
  group: "common" | "location" | "cell" | "gsm" | "umts" | "lte" | "nr" | "identifiers" | "date";
  availableOn: ("map" | "stations")[];
  valueKind: FilterValueKind;
  choices?: readonly FilterChoice[];
  example?: string;
};

export type SearchAssist =
  | { view: "home"; keywords: FilterKeyword[]; recents: string[] }
  | { view: "all"; keywords: FilterKeyword[] }
  | { view: "keywords"; keywords: FilterKeyword[] }
  | { view: "values"; keyword: FilterKeyword; selected: string[]; typed: string; editing: boolean };
