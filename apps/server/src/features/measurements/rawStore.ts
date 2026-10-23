import { randomUUID } from "node:crypto";
import { link, mkdir, open, readFile, readdir, rm, stat, statfs } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export type RawStoreName = "disk" | "s3";
export type CreateOutcome = "written" | "exists";
export type StoredName = { path: string; modifiedAt: Date; isTemporary: boolean };
export type FreeSpace = { freeBytes: number; totalBytes: number };

export interface RawStore {
  readonly name: RawStoreName;
  create(path: string, bytes: Buffer): Promise<CreateOutcome>;
  read(path: string): Promise<Buffer>;
  remove(path: string): Promise<void>;
  listDay(day: Date): Promise<StoredName[]>;
  freeSpace(): Promise<FreeSpace | null>;
}

const TEMPORARY_SUFFIX = ".tmp";
const CAN_SYNC_DIRECTORIES = process.platform !== "win32";

function dayDirectory(day: Date): string {
  const [year, month, date] = day.toISOString().slice(0, 10).split("-");
  return `raw/${year}/${month}/${date}`;
}

export function rawFilePath(receivedAt: Date, uploadId: string, sha256: Buffer): string {
  return `${dayDirectory(receivedAt)}/${uploadId}.${sha256.toString("hex").slice(0, 16)}`;
}

export function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

async function syncDirectory(directory: string): Promise<void> {
  if (!CAN_SYNC_DIRECTORIES) return;

  const handle = await open(directory, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

class DiskRawStore implements RawStore {
  readonly name = "disk";
  readonly #root: string;

  constructor(root: string) {
    this.#root = root;
  }

  async create(path: string, bytes: Buffer): Promise<CreateOutcome> {
    const target = join(this.#root, path);
    const directory = dirname(target);
    await mkdir(directory, { recursive: true });

    const temporary = join(directory, `.${basename(target)}.${randomUUID()}${TEMPORARY_SUFFIX}`);
    const handle = await open(temporary, "wx");
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }

    try {
      await link(temporary, target);
      return "written";
    } catch (error) {
      if (hasCode(error, "EEXIST")) return "exists";
      throw error;
    } finally {
      await rm(temporary, { force: true });
      await syncDirectory(directory);
    }
  }

  read(path: string): Promise<Buffer> {
    return readFile(join(this.#root, path));
  }

  async remove(path: string): Promise<void> {
    await rm(join(this.#root, path), { force: true });
  }

  async listDay(day: Date): Promise<StoredName[]> {
    const directory = dayDirectory(day);
    let names: string[];
    try {
      names = await readdir(join(this.#root, directory));
    } catch (error) {
      if (hasCode(error, "ENOENT")) return [];
      throw error;
    }
    return Promise.all(
      names.map(async (name) => ({
        path: `${directory}/${name}`,
        modifiedAt: (await stat(join(this.#root, directory, name))).mtime,
        isTemporary: name.endsWith(TEMPORARY_SUFFIX),
      })),
    );
  }

  async freeSpace(): Promise<FreeSpace> {
    await mkdir(this.#root, { recursive: true });
    const space = await statfs(this.#root);
    return { freeBytes: space.bavail * space.bsize, totalBytes: space.blocks * space.bsize };
  }
}

const RAW_STORES: Record<RawStoreName, () => RawStore> = {
  disk: () => {
    const directory = process.env.OBSERVATIONS_DIR?.trim();
    if (!directory) throw new Error("OBSERVATIONS_DIR is not set");
    return new DiskRawStore(directory);
  },
  s3: () => {
    throw new Error("The s3 raw store is not built yet");
  },
};

function isRawStoreName(name: string): name is RawStoreName {
  return Object.hasOwn(RAW_STORES, name);
}

export function rawStoreFor(name: RawStoreName): RawStore {
  return RAW_STORES[name]();
}

export function newUploadsStore(): RawStore {
  const name = process.env.OBSERVATIONS_STORE?.trim() || "disk";
  if (!isRawStoreName(name)) throw new Error(`OBSERVATIONS_STORE is "${name}", which is not a raw store`);
  return rawStoreFor(name);
}
