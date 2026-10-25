import { createHash } from "node:crypto";

import { DetailedErrorResponse } from "../../../errors.js";
import { openUpload } from "../rawFiles/seal.js";
import { hasCode, rawStoreFor, uploadFilePath } from "../rawFiles/store.js";
import type { UploadRow } from "./read.js";

const FILE_EXTENSIONS: Record<UploadRow["encoding"], string> = { zstd: "json.zst", gzip: "json.gz" };

export function uploadFileName(upload: UploadRow): string {
  return `${upload.id}.${FILE_EXTENSIONS[upload.encoding]}`;
}

export async function readUploadFile(upload: UploadRow): Promise<Buffer> {
  const gone = new DetailedErrorResponse("GONE", [{ kind: "fileDeleted" }], { message: "The file of this upload is gone" });
  if (upload.objectDeletedAt !== null) throw gone;

  let sealed: Buffer;
  try {
    sealed = await rawStoreFor(upload.store).read(uploadFilePath(upload));
  } catch (error) {
    if (hasCode(error, "ENOENT")) throw gone;
    throw error;
  }
  const body = openUpload(upload.id, sealed);
  if (!createHash("sha256").update(body).digest().equals(upload.bodySha256)) {
    throw new Error(`The file of upload ${upload.id} does not match its hash`);
  }
  return body;
}
