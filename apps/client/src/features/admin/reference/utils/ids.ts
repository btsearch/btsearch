import { isRecordId } from "@/lib/apiValues";

const RECORD_ID_PATTERN = /^[1-9]\d{0,9}$/;

export function parseRecordId(text: string): number | null {
  if (!RECORD_ID_PATTERN.test(text)) return null;
  const id = Number(text);
  return isRecordId(id) ? id : null;
}
