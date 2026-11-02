/**
 * Small, dependency-free CSV reader/writer (RFC 4180). Safe to import on the client.
 */

const BOM = '\ufeff';
const CANDIDATE_DELIMITERS = [',', ';', '\t'] as const;

/** Pick the delimiter that appears most often (outside quotes) in the first line. */
export const detectDelimiter = (text: string): string => {
  const source = text.startsWith(BOM) ? text.slice(1) : text;
  const counts = new Map<string, number>(CANDIDATE_DELIMITERS.map((d) => [d, 0]));
  let inQuotes = false;
  for (const char of source) {
    if ('"' === char) {
      inQuotes = !inQuotes;
    } else if (!inQuotes && ('\n' === char || '\r' === char)) {
      break;
    } else if (!inQuotes && counts.has(char)) {
      counts.set(char, (counts.get(char) ?? 0) + 1);
    }
  }
  return [...counts.entries()].reduce<[string, number]>(
    (best, entry) => (entry[1] > best[1] ? entry : best),
    [',', 0],
  )[0];
};

/**
 * Parse CSV text into rows of cells. Handles a UTF-8 BOM, quoted fields with escaped quotes,
 * delimiters and line breaks inside quotes, CRLF/LF/CR endings and blank lines (dropped).
 * An unterminated quote keeps the rest of the input as the last field.
 */
export const parseCsv = (input: string, delimiter = detectDelimiter(input)): string[][] => {
  const text = input.startsWith(BOM) ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let wasQuoted = false;

  const endField = () => {
    row.push(wasQuoted ? field : field.trim());
    field = '';
    wasQuoted = false;
  };
  const endRow = () => {
    endField();
    if (row.some((cell) => '' !== cell)) {
      rows.push(row);
    }
    row = [];
  };

  let i = 0;
  while (i < text.length) {
    const char = text[i]!;
    if (inQuotes) {
      if ('"' === char) {
        if ('"' === text[i + 1]) {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
      } else {
        field += char;
      }
      i += 1;
      continue;
    }
    if ('"' === char && '' === field.trim()) {
      // Opening quote (whitespace before it is ignored, as in `a, "b"`).
      field = '';
      inQuotes = true;
      wasQuoted = true;
    } else if (delimiter === char) {
      endField();
    } else if ('\r' === char || '\n' === char) {
      endRow();
      if ('\r' === char && '\n' === text[i + 1]) {
        i += 1;
      }
    } else if (!wasQuoted) {
      field += char;
    }
    // Text after a closing quote (e.g. `"a" b`) is ignored.
    i += 1;
  }
  if ('' !== field || wasQuoted || 0 < row.length) {
    endRow();
  }
  return rows;
};

/** Characters that make spreadsheet apps treat a cell as a formula. */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

/** Neutralise CSV/formula injection by prefixing risky cells with a single quote. */
export const guardFormula = (value: string): string =>
  FORMULA_TRIGGER.test(value) ? `'${value}` : value;

/** Undo {@link guardFormula} when reading our own export back in. */
export const unguardFormula = (value: string): string =>
  value.startsWith("'") && FORMULA_TRIGGER.test(value.slice(1)) ? value.slice(1) : value;

/** A plain decimal number we generated ourselves; written without the formula guard. */
export interface NumericCell {
  numeric: string;
}
export type CsvCell = string | NumericCell;

const NUMERIC = /^-?\d+(\.\d+)?$/;

const quote = (value: string, delimiter: string) =>
  value.includes(delimiter) ||
  value.includes('"') ||
  value.includes('\n') ||
  value.includes('\r') ||
  value !== value.trim()
    ? `"${value.replaceAll('"', '""')}"`
    : value;

const cellText = (cell: CsvCell) => {
  if ('string' === typeof cell) {
    return guardFormula(cell);
  }
  return NUMERIC.test(cell.numeric) ? cell.numeric : guardFormula(cell.numeric);
};

/** Serialise rows as RFC 4180 CSV with CRLF line endings and a UTF-8 BOM (Excel + Arabic). */
export const toCsv = (rows: CsvCell[][], delimiter = ','): string =>
  `${BOM}${rows
    .map((row) => row.map((cell) => quote(cellText(cell), delimiter)).join(delimiter))
    .join('\r\n')}\r\n`;
