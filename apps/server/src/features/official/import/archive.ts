import { randomUUID } from "node:crypto";
import { access, copyFile, mkdir, rename, unlink } from "node:fs/promises";
import path from "node:path";

export type DirectoryArchive = ReturnType<typeof directoryArchive>;

const DEFAULT_ARCHIVE_DIRECTORY = "official-archive";
const UNKNOWN_MEDIA_TYPE = "application/octet-stream";
const UNKNOWN_EXTENSION = "bin";
const MEDIA_TYPE_BY_EXTENSION: ReadonlyMap<string, string> = new Map([
  ["xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ["zip", "application/zip"],
]);

function extensionOf(fileName: string): string {
  return path.extname(fileName).slice(1).toLowerCase();
}

export function isZipContainer(fileName: string): boolean {
  return MEDIA_TYPE_BY_EXTENSION.has(extensionOf(fileName));
}

export function mediaTypeOf(fileName: string): string {
  return MEDIA_TYPE_BY_EXTENSION.get(extensionOf(fileName)) ?? UNKNOWN_MEDIA_TYPE;
}

export function archiveKeyOf(sha256: string, mediaType: string): string {
  const known = [...MEDIA_TYPE_BY_EXTENSION].find(([, knownMediaType]) => knownMediaType === mediaType);
  return `files/${sha256}.${known?.[0] ?? UNKNOWN_EXTENSION}`;
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export function directoryArchive(directory: string) {
  const pathOf = (key: string): string => path.join(directory, key);

  return {
    async has(key: string): Promise<boolean> {
      try {
        await access(pathOf(key));
        return true;
      } catch {
        return false;
      }
    },
    async put(key: string, localPath: string): Promise<void> {
      const target = pathOf(key);
      const partial = `${target}.${randomUUID()}.partial`;
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(localPath, partial);
      await rename(partial, target);
    },
    async fetchTo(key: string, localPath: string): Promise<void> {
      await copyFile(pathOf(key), localPath);
    },
    async remove(key: string): Promise<boolean> {
      try {
        await unlink(pathOf(key));
        return true;
      } catch (error) {
        if (isMissingFile(error)) return false;
        throw error;
      }
    },
  };
}

export function archiveFromEnvironment(): DirectoryArchive {
  return directoryArchive(path.resolve(process.env.OFFICIAL_ARCHIVE_DIR ?? DEFAULT_ARCHIVE_DIRECTORY));
}
