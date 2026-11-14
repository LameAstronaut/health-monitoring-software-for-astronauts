export type Column = { key: string; label: string; unit: string };
export type Dataset = {
  id: string;
  title: string;
  source: "NASA" | "MANUAL";
  source_url: string;
  accession: string;
  notes: string;
  columns: Column[];
  rows: Record<string, string | number | null>[];
  revision: number;
  digest: string;
  created_at: string;
};
// RFC 4180-style quoted cells, including embedded newlines and escaped quotes.
export function parseCSV(text: string): {
  columns: Column[];
  rows: Dataset["rows"];
} {
  if (text.length > 1_000_000)
    throw new Error("File exceeds the 1 MB import limit.");
  const records: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  const source = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"' && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
        closed = true;
      } else cell += c;
    } else if (c === '"') {
      if (cell || closed) throw new Error("Unexpected quote in CSV.");
      quoted = true;
    } else if (c === "," || c === "\n") {
      row.push(cell);
      cell = "";
      closed = false;
      if (c === "\n") {
        records.push(row);
        row = [];
      }
    } else {
      if (closed) throw new Error("Unexpected text after a quoted cell.");
      cell += c;
    }
  }
  if (quoted) throw new Error("Unclosed quoted cell.");
  if (cell || row.length || closed) records.push([...row, cell]);
  const headers = records.shift();
  if (!headers?.length || headers.some((h) => !h.trim()))
    throw new Error("Include nonempty column headers.");
  if (headers.length > 30 || !records.length || records.length > 500)
    throw new Error("Import 1–500 rows and 1–30 columns.");
  const columns = headers.map((label, i) => ({
    key: `field_${i + 1}`,
    label: label.trim(),
    unit: "",
  }));
  if (columns.some((c) => c.label.length > 100))
    throw new Error("Column headers must be at most 100 characters.");
  const rows = records.map((values, index) => {
    if (values.length !== columns.length)
      throw new Error(
        `Row ${index + 2}: expected ${columns.length} cells, received ${values.length}.`,
      );
    if (values.some((v) => v.length > 500))
      throw new Error(`Row ${index + 2}: a cell exceeds 500 characters.`);
    return Object.fromEntries(values.map((v, i) => [columns[i].key, v]));
  });
  return { columns, rows };
}
