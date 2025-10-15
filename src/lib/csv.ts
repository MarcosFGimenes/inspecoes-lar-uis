// src/lib/csv.ts

export type CsvRow = Record<string, string>;

export interface ParseCsvOptions {
  delimiter?: string;
  skipEmptyLines?: boolean;
}

export function parseCsv(content: string | Buffer, options: ParseCsvOptions = {}): CsvRow[] {
  const delimiter = options.delimiter ?? ",";
  const skipEmptyLines = options.skipEmptyLines ?? true;

  const text = (typeof content === "string" ? content : content.toString("utf-8")).replace(/^\ufeff/, "");
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

  if (!rows.length) {
    return [];
  }

  const [header, ...dataRows] = rows;
  const headers = header.map(column => column.trim());
  const records: CsvRow[] = [];

  for (const dataRow of dataRows) {
    const record: CsvRow = {};
    headers.forEach((column, index) => {
      record[column] = (dataRow[index] ?? "").trim();
    });
    records.push(record);
  }

  return records;
}
