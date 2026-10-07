import type { CLFExportFormat } from "@/hooks/usePreferences";

const FILE_EXTENSION_BY_FORMAT: Record<CLFExportFormat, string> = {
  "2.0": "clf",
  "2.1": "clf",
  "3.0-dec": "clf",
  "3.0-hex": "clf",
  "4.0": "clf",
  ntm: "ntm",
  netmonitor: "csv",
};

type ExportFileHandle = {
  createWritable: () => Promise<WritableStream<Uint8Array>>;
};

type SaveFilePickerWindow = Window & {
  showSaveFilePicker?: (options: { suggestedName: string; types: { accept: Record<string, string[]> }[] }) => Promise<ExportFileHandle>;
};

type DownloadOptions = {
  controller: AbortController;
  destination: ExportFileHandle | null;
  onProgress: (receivedBytes: number) => void;
};

type DownloadResult = "saved" | "cancelled" | "failed";

function getExportFilename(format: CLFExportFormat): string {
  return `cells_export_${format}.${FILE_EXTENSION_BY_FORMAT[format]}`;
}

export function isExportCancelled(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export async function chooseExportFile(format: CLFExportFormat): Promise<ExportFileHandle | null> {
  const pickerWindow = window as SaveFilePickerWindow;
  if (!window.isSecureContext || typeof pickerWindow.showSaveFilePicker !== "function" || typeof TransformStream !== "function") return null;
  return pickerWindow.showSaveFilePicker({
    suggestedName: getExportFilename(format),
    types: [{ accept: { "text/plain": [`.${FILE_EXTENSION_BY_FORMAT[format]}`] } }],
  });
}

function downloadBlob(blob: Blob, filename: string): void {
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  try {
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(downloadUrl);
  }
}

export async function downloadExport(url: string, format: CLFExportFormat, options: DownloadOptions): Promise<DownloadResult> {
  const { controller, destination, onProgress } = options;
  const { signal } = controller;
  let writable: WritableStream<Uint8Array> | undefined;
  if (signal.aborted) return "cancelled";

  try {
    const response = await fetch(url, { credentials: "include", signal });
    if (!response.ok) throw new Error(`Export failed: ${response.status}`);

    let receivedBytes = 0;
    let lastProgressUpdate = performance.now();
    let stream: ReadableStream<Uint8Array> | undefined;
    if (response.body !== null && typeof TransformStream === "function")
      stream = response.body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, output) {
            receivedBytes += chunk.byteLength;
            const now = performance.now();
            if (now - lastProgressUpdate >= 100) {
              onProgress(receivedBytes);
              lastProgressUpdate = now;
            }
            output.enqueue(chunk);
          },
          flush() {
            onProgress(receivedBytes);
          },
        }),
      );

    if (destination !== null) {
      if (stream === undefined) throw new Error("Export response has no body");
      writable = await destination.createWritable();
      if (signal.aborted) throw new DOMException("Export cancelled", "AbortError");
      await stream.pipeTo(writable, { signal });
    } else {
      const blob = stream === undefined ? await response.blob() : await new Response(stream, { headers: response.headers }).blob();
      if (signal.aborted) return "cancelled";
      if (stream === undefined) onProgress(blob.size);
      downloadBlob(blob, getExportFilename(format));
    }
    return "saved";
  } catch (error) {
    const result = signal.aborted || isExportCancelled(error) ? "cancelled" : "failed";
    controller.abort();
    if (writable !== undefined) await writable.abort(error).catch(() => undefined);
    return result;
  }
}
