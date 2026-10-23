import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

type SealKey = { id: string; key: Buffer };
export type Sealed = { bytes: Buffer; keyId: string };

const SEAL_FORMAT_VERSION = 1;
const CIPHER = "aes-256-gcm";
const KEY_BYTES = 32;
const KEY_ID_MAX_LENGTH = 16;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const KEYS_FORMAT = "OBSERVATIONS_SEAL_KEYS must list id:base64 pairs of 32-byte keys, newest first, separated by commas";

function readSealKeys(): SealKey[] {
  const value = process.env.OBSERVATIONS_SEAL_KEYS?.trim();
  if (!value) throw new Error("OBSERVATIONS_SEAL_KEYS is not set");

  return value.split(",").map((entry) => {
    const [id = "", encodedKey = ""] = entry.trim().split(":");
    const key = Buffer.from(encodedKey, "base64");
    if (id === "" || id.length > KEY_ID_MAX_LENGTH || key.length !== KEY_BYTES) throw new Error(KEYS_FORMAT);
    return { id, key };
  });
}

export function sealUpload(uploadId: string, body: Buffer): Sealed {
  const [newest] = readSealKeys();
  if (!newest) throw new Error(KEYS_FORMAT);

  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(CIPHER, newest.key, nonce);
  cipher.setAAD(Buffer.from(uploadId));
  const encrypted = Buffer.concat([cipher.update(body), cipher.final()]);
  const keyId = Buffer.from(newest.id);
  const header = Buffer.from([SEAL_FORMAT_VERSION, keyId.length]);
  return { bytes: Buffer.concat([header, keyId, nonce, encrypted, cipher.getAuthTag()]), keyId: newest.id };
}

export function openUpload(uploadId: string, sealed: Buffer): Buffer {
  if (sealed[0] !== SEAL_FORMAT_VERSION) throw new Error(`Upload ${uploadId} is not sealed in format ${SEAL_FORMAT_VERSION}`);

  const keyIdEnd = 2 + (sealed[1] ?? 0);
  const keyId = sealed.subarray(2, keyIdEnd).toString();
  const sealKey = readSealKeys().find((candidate) => candidate.id === keyId);
  if (!sealKey) throw new Error(`Upload ${uploadId} is sealed with key ${keyId}, which is not in OBSERVATIONS_SEAL_KEYS`);

  const nonceEnd = keyIdEnd + NONCE_BYTES;
  const decipher = createDecipheriv(CIPHER, sealKey.key, sealed.subarray(keyIdEnd, nonceEnd));
  decipher.setAAD(Buffer.from(uploadId));
  decipher.setAuthTag(sealed.subarray(sealed.length - TAG_BYTES));
  return Buffer.concat([decipher.update(sealed.subarray(nonceEnd, sealed.length - TAG_BYTES)), decipher.final()]);
}
