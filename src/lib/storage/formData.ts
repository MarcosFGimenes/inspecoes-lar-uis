import { Buffer } from "node:buffer";

import { fromDataUrl, isAllowedMimeType } from "./dataUrl";

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export type ParsedFormImage = {
  buffer: Buffer;
  mime: string;
  fileName?: string;
};

export async function parseImageFormEntry(entry: FormDataEntryValue): Promise<ParsedFormImage> {
  if (typeof entry === "string") {
    const { buffer, mime } = fromDataUrl(entry);
    return { buffer, mime };
  }

  if (entry instanceof File) {
    const buffer = Buffer.from(await entry.arrayBuffer());
    const mime = entry.type || "application/octet-stream";
    if (!isAllowedMimeType(mime)) {
      throw new Error("IMAGE_MIME_NOT_ALLOWED");
    }
    if (buffer.length === 0) {
      throw new Error("IMAGE_EMPTY");
    }
    if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
      throw new Error("IMAGE_TOO_LARGE");
    }
    return { buffer, mime, fileName: entry.name };
  }

  throw new Error("INVALID_FORM_ENTRY");
}

