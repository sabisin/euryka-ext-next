import type { DragImageResult } from "./types";
import { generateUploadUrl, uploadToGcs } from "./api";

const IMAGE_EXTENSION_RE = /\.(png|jpe?g|gif|webp|bmp|svg|avif|apng|tiff)(\?.*)?$/i;
const MAX_SIZE_MB = 16;

export function isImageUrl(url: string): boolean {
  return IMAGE_EXTENSION_RE.test(url.split("?")[0]);
}

export function getDraggedImage(e: DragEvent): DragImageResult | null {
  const dt = e.dataTransfer;
  if (!dt) return null;

  // 1. File drop
  if (dt.files.length > 0) {
    const file = dt.files[0];
    if (!file.type.startsWith("image/")) return null;
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      throw new Error(`File too large. Max ${MAX_SIZE_MB} MB.`);
    }
    const objectUrl = URL.createObjectURL(file);
    return {
      url: objectUrl,
      source: "filesystem",
      file,
      name: file.name,
      mime: file.type,
      objectUrl,
    };
  }

  // 2. HTML drag (img/video tag)
  const html = dt.getData("text/html");
  if (html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const img = doc.querySelector("img");
    if (img?.src) {
      return {
        url: img.src,
        source: "browser",
        origin: "html",
        name: img.alt || undefined,
        isDataUrl: img.src.startsWith("data:"),
      };
    }
  }

  // 3. URI list
  const uri = dt.getData("text/uri-list");
  if (uri) {
    const url = uri.split("\n").find((line) => !line.startsWith("#"))?.trim();
    if (url && isImageUrl(url)) {
      return { url, source: "browser", origin: "uri" };
    }
    if (url) throw new Error("Only images are allowed by URL.");
  }

  return null;
}

export function validateDraggedImage(result: DragImageResult): void {
  if (result.source === "filesystem") {
    if (result.file && result.file.size > MAX_SIZE_MB * 1024 * 1024) {
      throw new Error(`File too large. Max ${MAX_SIZE_MB} MB.`);
    }
    if (result.mime && !result.mime.startsWith("image/")) {
      throw new Error("File type not supported.");
    }
  }
  if (
    result.source === "browser" &&
    result.origin !== "html" &&
    result.url &&
    !result.isDataUrl
  ) {
    if (!isImageUrl(result.url)) {
      throw new Error("Only images are allowed by URL.");
    }
  }
}

export async function uploadFileWithRetry(
  token: string,
  wsId: string,
  file: File
): Promise<{ uploadedUrl: string; imageUrl: string }> {
  const { url: signedUrl, image } = await generateUploadUrl(token, wsId, file.name);
  await uploadToGcs(signedUrl, file);
  return { uploadedUrl: signedUrl, imageUrl: image.url };
}
