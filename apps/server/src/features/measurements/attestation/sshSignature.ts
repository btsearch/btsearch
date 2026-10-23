import { createHash, createPublicKey, verify } from "node:crypto";

type Reader = { bytes: Buffer; offset: number };

const SIGNATURE_MAGIC = Buffer.from("SSHSIG");
const ARMOR_LINES = /-----(BEGIN|END) SSH SIGNATURE-----/g;
const HASH_ALGORITHMS = new Set(["sha256", "sha512"]);
const ED25519 = "ssh-ed25519";

function readUint32(reader: Reader): number {
  const value = reader.bytes.readUInt32BE(reader.offset);
  reader.offset += 4;
  return value;
}

function readString(reader: Reader): Buffer {
  const length = readUint32(reader);
  const value = reader.bytes.subarray(reader.offset, reader.offset + length);
  if (value.length !== length) throw new RangeError("The SSH signature ends early");
  reader.offset += length;
  return value;
}

function toSshString(value: Buffer | string): Buffer {
  const bytes = Buffer.from(value);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length);
  return Buffer.concat([length, bytes]);
}

function readEd25519(blob: Buffer): Buffer | null {
  const reader = { bytes: blob, offset: 0 };
  return readString(reader).toString() === ED25519 ? readString(reader) : null;
}

export function verifySshSignature(message: Buffer, armoredSignature: string, signerKey: Buffer, namespace: string): boolean {
  try {
    const blob = Buffer.from(armoredSignature.replace(ARMOR_LINES, "").replace(/\s+/g, ""), "base64");
    if (!blob.subarray(0, SIGNATURE_MAGIC.length).equals(SIGNATURE_MAGIC)) return false;

    const reader = { bytes: blob, offset: SIGNATURE_MAGIC.length };
    const version = readUint32(reader);
    const publicKey = readString(reader);
    const signedNamespace = readString(reader).toString();
    const reserved = readString(reader);
    const hashAlgorithm = readString(reader).toString();
    const signature = readEd25519(readString(reader));
    const rawKey = readEd25519(signerKey);
    const isExpectedSigner = version === 1 && publicKey.equals(signerKey) && signedNamespace === namespace;
    if (!isExpectedSigner || !HASH_ALGORITHMS.has(hashAlgorithm) || signature === null || rawKey === null) return false;

    const signedData = Buffer.concat([
      SIGNATURE_MAGIC,
      toSshString(namespace),
      toSshString(reserved),
      toSshString(hashAlgorithm),
      toSshString(createHash(hashAlgorithm).update(message).digest()),
    ]);
    const key = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: rawKey.toString("base64url") }, format: "jwk" });
    return verify(null, signedData, key, signature);
  } catch {
    return false;
  }
}
