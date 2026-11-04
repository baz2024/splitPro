import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { t } from './i18n';

// iOS WebViews can't save the in-memory files the web app creates for exports. The web app posts
// the file here instead (src/components/DataIO/transfer.ts), and the share sheet saves or sends it.
const FILE_DOWNLOAD_MESSAGE = 'file-download';

export interface FileDownload {
  fileName: string;
  mimeType: string;
  base64: string;
}

export const parseFileDownload = (data: string): FileDownload | null => {
  try {
    const message = JSON.parse(data) as Partial<FileDownload> & { type?: unknown };
    if (
      FILE_DOWNLOAD_MESSAGE !== message.type ||
      'string' !== typeof message.fileName ||
      'string' !== typeof message.mimeType ||
      'string' !== typeof message.base64
    ) {
      return null;
    }
    return { fileName: message.fileName, mimeType: message.mimeType, base64: message.base64 };
  } catch {
    return null;
  }
};

// The name comes from a web page, so keep it inside the cache folder.
const safeFileName = (fileName: string) =>
  fileName.replace(/[/\\:\0]/g, '_').replace(/^\.+/, '') || 'safi-export';

export const shareFileDownload = async ({ fileName, mimeType, base64 }: FileDownload) => {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error(t.shareFileFailed);
  }
  const file = new File(Paths.cache, safeFileName(fileName));
  file.create({ overwrite: true });
  await file.write(Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)));
  await Sharing.shareAsync(file.uri, {
    mimeType: mimeType.split(';')[0],
    dialogTitle: fileName,
  });
};
