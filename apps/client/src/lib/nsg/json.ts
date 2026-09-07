export type NsgJsonValue = string | number | boolean | null | NsgJsonValue[] | NsgJsonObject;
export type NsgJsonObject = { [key: string]: NsgJsonValue };
