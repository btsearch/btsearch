type UploadPart = { name: string; filename?: string; content: string | Buffer; contentType?: string };

export function multipartPayload(parts: readonly UploadPart[]) {
  const boundary = "openbts-unit-test-boundary";
  const chunks: Buffer[] = [];
  for (const part of parts) {
    const filename = part.filename === undefined ? "" : `; filename="${part.filename}"`;
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"${filename}\r\n`));
    if (part.contentType !== undefined) chunks.push(Buffer.from(`Content-Type: ${part.contentType}\r\n`));
    chunks.push(Buffer.from("\r\n"), Buffer.from(part.content), Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { headers: { "content-type": `multipart/form-data; boundary=${boundary}` }, payload: Buffer.concat(chunks) };
}
