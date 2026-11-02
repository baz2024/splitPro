import { gunzipSync } from 'node:zlib';

import { parseCsv } from './csv';
import { type ParsedTable } from './normalise';
import { MAX_IMPORT_BYTES, MAX_IMPORT_COLUMNS, MAX_IMPORT_ROWS } from './types';
import { TableTooLargeError, readXlsx } from './xlsx';

export type UploadErrorCode = 'too_large' | 'too_many_rows' | 'wrong_type' | 'read_failed';

export class UploadError extends Error {
  readonly code: UploadErrorCode;

  constructor(code: UploadErrorCode) {
    super(code);
    this.code = code;
  }
}

/** Decode the client's gzip+base64 upload, refusing anything over the size cap. */
export const decodeUpload = (gzipBase64: string): Buffer => {
  try {
    return gunzipSync(Buffer.from(gzipBase64, 'base64'), { maxOutputLength: MAX_IMPORT_BYTES });
  } catch (error) {
    if (
      error instanceof RangeError ||
      (error instanceof Error && 'code' in error && 'ERR_BUFFER_TOO_LARGE' === error.code)
    ) {
      throw new UploadError('too_large');
    }
    throw new UploadError('read_failed');
  }
};

const decodeText = (buffer: Buffer) => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    // Legacy exports: fall back to Windows-1252 rather than failing outright.
    return new TextDecoder('windows-1252').decode(buffer);
  }
};

export const fileKind = (name: string): 'csv' | 'xlsx' | null => {
  const lower = name.toLowerCase();
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
    return 'csv';
  }
  return lower.endsWith('.xlsx') ? 'xlsx' : null;
};

const parseByKind = async (kind: 'csv' | 'xlsx', buffer: Buffer): Promise<ParsedTable> => {
  if ('xlsx' === kind) {
    return readXlsx(buffer);
  }
  const [headers = [], ...rows] = parseCsv(decodeText(buffer));
  return { headers, rows };
};

/** Parse an uploaded CSV/XLSX into a header row and data rows, enforcing row/column caps. */
export const readTable = async (name: string, buffer: Buffer): Promise<ParsedTable> => {
  const kind = fileKind(name);
  if (!kind) {
    throw new UploadError('wrong_type');
  }
  if (MAX_IMPORT_BYTES < buffer.length) {
    throw new UploadError('too_large');
  }
  const table = await parseByKind(kind, buffer).catch((error: unknown) => {
    throw new UploadError(error instanceof TableTooLargeError ? 'too_many_rows' : 'read_failed');
  });
  if (MAX_IMPORT_ROWS < table.rows.length) {
    throw new UploadError('too_many_rows');
  }
  const width = Math.min(MAX_IMPORT_COLUMNS, table.headers.length);
  return {
    headers: table.headers.slice(0, width),
    rows: table.rows.map((row) => row.slice(0, width)),
  };
};
