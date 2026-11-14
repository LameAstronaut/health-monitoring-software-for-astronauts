import { useEffect, useState } from "react";
import { get, post } from "../services/api";
import { Panel, stamp } from "../components/medical";
import { parseCSV, type Dataset } from "../dataset";

type Summary = Pick<Dataset, "id" | "title" | "source" | "created_at"> & {
  row_count: number;
};
const blank = (): Omit<
  Dataset,
  "id" | "revision" | "digest" | "created_at"
> => ({
  title: "",
  source: "MANUAL",
  source_url: "",
  accession: "",
  notes: "",
  columns: [{ key: "field_1", label: "Measurement", unit: "" }],
  rows: [{ field_1: "" }],
});
export function DataWorkspace() {
  const [table, setTable] = useState(blank);
  const [saved, setSaved] = useState<Dataset | null>(null);
  const [tables, setTables] = useState<Summary[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const locked = saved?.source === "NASA";
  const refresh = () => get<Summary[]>("datasets").then(setTables);
  useEffect(() => {
    const controller = new AbortController();
    void get<Summary[]>("datasets", controller.signal)
      .then(setTables)
      .catch((e) => {
        if (!controller.signal.aborted) setError(String(e));
      });
    return () => controller.abort();
  }, []);
  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="screen-stack">
      <div className="info-banner">
        Research reference workspace · Imported data never generates crew alerts
        or replaces live readings. Use Simulator controls to apply manual
        telemetry.
      </div>
      <div className="two-columns">
        <Panel title="NASA data sources">
          <p>
            Download a tabular CSV from a NASA repository, then import it here.
            Record the dataset identifier and original source URL so it remains
            traceable.
          </p>
          <div className="button-row">
            <a
              href="https://osdr.nasa.gov/bio/repo/"
              target="_blank"
              rel="noreferrer"
            >
              Open Science Data Repository ↗
            </a>
            <a href="https://data.nasa.gov/" target="_blank" rel="noreferrer">
              NASA data catalog ↗
            </a>
          </div>
          <p className="caption">
            CSV: up to 1 MB, 500 rows, 30 columns. Headers and quoted cells are
            supported. Set units explicitly; values are preserved without
            conversion. This importer does not support raw imaging or omics
            archives.
          </p>
        </Panel>
        <Panel title="Saved reference tables">
          <button disabled={busy} onClick={() => void run(refresh)}>
            Refresh library
          </button>
          {!tables.length && <p className="caption">No saved tables yet.</p>}
          <ul className="dataset-library">
            {tables.map((item) => (
              <li key={item.id}>
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const data = await get<Dataset>(`datasets/${item.id}`);
                      setSaved(data);
                      setTable(data);
                      setPage(0);
                    })
                  }
                >
                  {item.title}{" "}
                  <small>
                    {item.source} · {item.row_count} rows
                  </small>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
      <Panel
        title={
          saved
            ? `Reference table · revision ${saved.revision}`
            : "Prepare a reference table"
        }
      >
        {error && (
          <p className="error-inline" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="success-inline" role="status">
            {message}
          </p>
        )}
        <div className="button-row">
          <button
            disabled={busy}
            onClick={() => {
              setSaved(null);
              setTable(blank());
              setPage(0);
              setMessage("");
              setError("");
            }}
          >
            New table
          </button>
          <label className="field">
            Import CSV
            <input
              type="file"
              accept=".csv,text/csv"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file)
                  void run(async () => {
                    if (file.size > 1_000_000)
                      throw new Error("File exceeds the 1 MB import limit.");
                    const parsed = parseCSV(await file.text());
                    setSaved(null);
                    setTable({
                      ...blank(),
                      title: file.name.replace(/\.csv$/i, ""),
                      source: "NASA",
                      ...parsed,
                    });
                    setPage(0);
                    setMessage(
                      "Preview ready. Add provenance and units before saving.",
                    );
                  });
              }}
            />
          </label>
          <button
            disabled={busy}
            onClick={() => {
              const blob = new Blob([JSON.stringify(saved ?? table, null, 2)], {
                type: "application/json",
              });
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = "astra-reference.json";
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            {saved ? "Export saved JSON" : "Export draft JSON"}
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const {
                title,
                source,
                source_url,
                accession,
                notes,
                columns,
                rows,
              } = table;
              const payload = {
                title,
                source,
                source_url,
                accession,
                notes,
                columns,
                rows,
              };
              const result = await post<Dataset>(
                saved ? `datasets/${saved.id}` : "datasets",
                saved
                  ? { ...payload, expected_revision: saved.revision }
                  : payload,
              );
              setSaved(result);
              setTable(result);
              setMessage("Table saved. Provenance and checksum recorded.");
              await refresh();
            });
          }}
        >
          <fieldset disabled={busy || !!locked} className="dataset-editor">
            <div className="manual-fields">
              <label className="field">
                Table title
                <input
                  required
                  maxLength={160}
                  value={table.title}
                  onChange={(e) =>
                    setTable({ ...table, title: e.target.value })
                  }
                />
              </label>
              <label className="field">
                Source
                <select
                  disabled={!!saved}
                  value={table.source}
                  onChange={(e) =>
                    setTable({
                      ...table,
                      source: e.target.value as "NASA" | "MANUAL",
                    })
                  }
                >
                  <option value="MANUAL">Manual simulation reference</option>
                  <option value="NASA">NASA dataset export</option>
                </select>
              </label>
              <label className="field">
                Dataset identifier
                <input
                  required={table.source === "NASA"}
                  maxLength={100}
                  value={table.accession}
                  onChange={(e) =>
                    setTable({ ...table, accession: e.target.value })
                  }
                  placeholder="e.g. OSD study accession"
                />
              </label>
              <label className="field">
                Original NASA source URL
                <input
                  type="url"
                  required={table.source === "NASA"}
                  maxLength={2000}
                  value={table.source_url}
                  onChange={(e) =>
                    setTable({ ...table, source_url: e.target.value })
                  }
                  placeholder="https://osdr.nasa.gov/…"
                />
              </label>
            </div>
            <label className="field">
              Context / notes
              <textarea
                maxLength={2000}
                value={table.notes}
                onChange={(e) => setTable({ ...table, notes: e.target.value })}
                placeholder="Population, conditions, missing-value conventions, and limitations"
              />
            </label>
            <div
              className="table-scroll"
              tabIndex={0}
              role="region"
              aria-label="Editable dataset preview"
            >
              <table className="result-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    {table.columns.map((c, i) => (
                      <th key={c.key}>
                        <input
                          aria-label={`Column ${i + 1} name`}
                          required
                          maxLength={100}
                          value={c.label}
                          onChange={(e) =>
                            setTable({
                              ...table,
                              columns: table.columns.map((v, j) =>
                                j === i ? { ...v, label: e.target.value } : v,
                              ),
                            })
                          }
                        />
                        <input
                          aria-label={`Column ${i + 1} unit`}
                          maxLength={40}
                          placeholder="Unit (if applicable)"
                          value={c.unit}
                          onChange={(e) =>
                            setTable({
                              ...table,
                              columns: table.columns.map((v, j) =>
                                j === i ? { ...v, unit: e.target.value } : v,
                              ),
                            })
                          }
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows
                    .slice(page * 20, (page + 1) * 20)
                    .map((row, offset) => {
                      const index = page * 20 + offset;
                      return (
                        <tr key={index}>
                          <th>{index + 1}</th>
                          {table.columns.map((c) => (
                            <td key={c.key}>
                              <input
                                aria-label={`Row ${index + 1}, ${c.label}`}
                                maxLength={500}
                                value={row[c.key] ?? ""}
                                onChange={(e) =>
                                  setTable({
                                    ...table,
                                    rows: table.rows.map((r, j) =>
                                      j === index
                                        ? { ...r, [c.key]: e.target.value }
                                        : r,
                                    ),
                                  })
                                }
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            <div className="button-row">
              <button
                type="button"
                disabled={table.rows.length >= 500}
                onClick={() => {
                  setTable({
                    ...table,
                    rows: [
                      ...table.rows,
                      Object.fromEntries(table.columns.map((c) => [c.key, ""])),
                    ],
                  });
                  setPage(Math.floor(table.rows.length / 20));
                }}
              >
                Add row
              </button>
              <button
                type="button"
                disabled={table.columns.length >= 30}
                onClick={() => {
                  const key = `field_${table.columns.length + 1}`;
                  setTable({
                    ...table,
                    columns: [
                      ...table.columns,
                      {
                        key,
                        label: `Field ${table.columns.length + 1}`,
                        unit: "",
                      },
                    ],
                    rows: table.rows.map((r) => ({ ...r, [key]: "" })),
                  });
                }}
              >
                Add data field
              </button>
              <button className="primary-button">
                {saved ? "Save revision" : "Save reference table"}
              </button>
            </div>
          </fieldset>
        </form>
        <div className="button-row">
          <button disabled={page === 0} onClick={() => setPage(page - 1)}>
            Previous rows
          </button>
          <span>
            {table.rows.length} rows · page {page + 1} /{" "}
            {Math.ceil(table.rows.length / 20)}
          </span>
          <button
            disabled={(page + 1) * 20 >= table.rows.length}
            onClick={() => setPage(page + 1)}
          >
            Next rows
          </button>
        </div>
        {locked && (
          <p className="caption">
            NASA reference tables are immutable. Export to retain a local copy,
            or start a new table for another import.
          </p>
        )}
        {saved && (
          <p className="caption dataset-digest">
            Saved {stamp(saved.created_at, true)} · SHA-256 {saved.digest}
          </p>
        )}
      </Panel>
    </div>
  );
}
