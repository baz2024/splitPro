const CHUNK = 0x8000;

const bytesToBase64 = (bytes: Uint8Array) => {
  const parts = Array.from({ length: Math.ceil(bytes.length / CHUNK) }, (_, i) =>
    String.fromCharCode(...bytes.subarray(i * CHUNK, (i + 1) * CHUNK)),
  );
  return btoa(parts.join(''));
};

const base64ToBytes = (base64: string) =>
  Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));

/** Gzip a picked file in the browser and base64 it, so uploads stay under the body limit. */
export const gzipFileToBase64 = async (file: Blob): Promise<string> => {
  const stream = file.stream().pipeThrough(new CompressionStream('gzip'));
  return bytesToBase64(new Uint8Array(await new Response(stream).arrayBuffer()));
};

/**
 * Only the Safi mobile app defines this. Its WebView can't save blob: URLs on iOS, so it takes the
 * file over this bridge and opens the share sheet (mobile/src/lib/download.ts).
 */
const nativeBridge = () =>
  (window as Window & { ReactNativeWebView?: { postMessage: (message: string) => void } })
    .ReactNativeWebView;

export const saveBlob = async (blob: Blob, fileName: string) => {
  const bridge = nativeBridge();
  if (bridge) {
    bridge.postMessage(
      JSON.stringify({
        type: 'file-download',
        fileName,
        mimeType: blob.type,
        base64: bytesToBase64(new Uint8Array(await blob.arrayBuffer())),
      }),
    );
    return;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** Inflate a gzip+base64 file from the server and hand it to the browser as a download. */
export const saveGzipBase64 = async (gzipBase64: string, fileName: string, mimeType: string) => {
  const stream = new Blob([base64ToBytes(gzipBase64)])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'));
  const data = await new Response(stream).arrayBuffer();
  await saveBlob(new Blob([data], { type: mimeType }), fileName);
};

export const saveText = (text: string, fileName: string, mimeType: string) =>
  saveBlob(new Blob([text], { type: mimeType }), fileName);

export const browserTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};
