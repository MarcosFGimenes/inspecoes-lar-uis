// src/lib/csv.ts

export type CsvRow = Record<string, string>;

export interface ParseCsvOptions {
  delimiter?: string;
  skipEmptyLines?: boolean;
}

const CANDIDATE_DELIMITERS = [",", ";", "\t"] as const;

function splitCsvRows(text: string, delimiter: string, skipEmptyLines: boolean): string[][] {
  const rows: string[][] = [];
  let currentField = "";
  let currentRow: string[] = [];
  let inQuotes = false;

  const pushField = () => {
    currentRow.push(currentField);
    currentField = "";
  };

  const pushRow = () => {
    if (skipEmptyLines) {
      const hasContent = currentRow.some(field => field.trim().length > 0);
      if (!hasContent) {
        currentRow = [];
        return;
      }
    }
    rows.push(currentRow);
    currentRow = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;

    if (char === "\"") {
      if (inQuotes && text[index + 1] === "\"") {
        currentField += "\"";
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      pushField();
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && text[index + 1] === "\n") {
        index += 1;
      }
      pushField();
      pushRow();
      continue;
    }

    currentField += char;
  }

  pushField();
  if (currentRow.length > 1 || currentRow[0]?.trim()) {
    pushRow();
  }

  return rows;
}

function scoreRows(rows: string[][]) {
  if (!rows.length) return 0;
  const [header, ...dataRows] = rows;
  const headerColumns = header.length;
  const comparableRows = dataRows.slice(0, 25);
  const matchingRows = comparableRows.filter(row => row.length === headerColumns).length;
  const populatedHeaders = header.filter(column => column.trim().length > 0).length;

  return headerColumns * 100 + populatedHeaders * 10 + matchingRows;
}

function detectDelimiter(text: string, skipEmptyLines: boolean) {
  return CANDIDATE_DELIMITERS.map(delimiter => ({
    delimiter,
    rows: splitCsvRows(text, delimiter, skipEmptyLines),
  })).sort((a, b) => scoreRows(b.rows) - scoreRows(a.rows))[0]!;
}

export function parseCsv(content: string | Buffer, options: ParseCsvOptions = {}): CsvRow[] {
  const skipEmptyLines = options.skipEmptyLines ?? true;

  const text = (typeof content === "string" ? content : content.toString("utf-8")).replace(/^\ufeff/, "");
  const parsed = options.delimiter
    ? { delimiter: options.delimiter, rows: splitCsvRows(text, options.delimiter, skipEmptyLines) }
    : detectDelimiter(text, skipEmptyLines);
  const { delimiter, rows } = parsed;

  if (!rows.length) {
    return [];
  }

  const [header, ...dataRows] = rows;
  const headers = header.map(column => column.trim());
  const records: CsvRow[] = [];

  for (const dataRow of dataRows) {
    const normalizedRow = dataRow.length === 1 && headers.length > 1 && dataRow[0]?.includes(delimiter)
      ? splitCsvRows(dataRow[0], delimiter, false)[0] ?? dataRow
      : dataRow;
    const record: CsvRow = {};
    headers.forEach((column, index) => {
      record[column] = (normalizedRow[index] ?? "").trim();
    });
    records.push(record);
  }

  return records;
}
