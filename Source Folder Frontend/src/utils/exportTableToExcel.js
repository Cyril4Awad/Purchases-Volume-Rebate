import { saveWorkbook, startSheet } from "./excelBrand";

// Resolves a cell value from a row given a column definition: select options {value, label},
// booleans (Yes/No), plain strings and numbers.
const resolveValue = (row, col) => {
    const raw = row[col.accessor];
    if (typeof raw === "boolean") return raw ? "Yes" : "No";
    if (raw && typeof raw === "object" && "label" in raw) return raw.label ?? "";
    if (raw == null) return "";
    return String(raw);
};

const looksNumeric = (v) => /^-?[\d,]+(\.\d+)?%?$/.test(String(v).trim());

/**
 * Exports a table as a branded Excel sheet (logo, centred title, colours, grid).
 *
 * @param {Array}  columns   [{ Header, accessor, num? }] - same columns as the on-screen table
 * @param {Array}  data      rows
 * @param {string} filename  file name without .xlsx; also the sheet title
 * @param {string} sheetName sheet tab name
 * @param {object} options   { title, subtitle, totals: { [accessor]: value } }
 */
export default async function exportTableToExcel(columns, data, filename, sheetName = "Sheet1", options = {}) {
    const cols = columns.filter((col) => {
        if (!col.accessor) return false;
        const h = String(col.Header ?? "").trim().toLowerCase();
        const a = String(col.accessor ?? "").trim().toLowerCase();
        return h !== "actions" && a !== "actions" && (h !== "" || a !== "");
    });

    if (!cols.length || !data.length) {
        alert("No data to export.");
        return;
    }

    const rows = data.map((row) => Object.fromEntries(cols.map((c) => [c.accessor, resolveValue(row, c)])));
    const numeric = Object.fromEntries(cols.map((c) => [
        c.accessor,
        c.num ?? (rows.some((r) => r[c.accessor] !== "") && rows.every((r) => r[c.accessor] === "" || looksNumeric(r[c.accessor]))),
    ]));
    const widths = cols.map((c) => Math.min(48, Math.max(12, String(c.Header ?? "").length + 4,
        ...rows.map((r) => String(r[c.accessor]).length + 3))));

    const { wb, cursor } = await startSheet({
        title: options.title ?? filename,
        subtitle: options.subtitle,
        sheetName,
        columns: widths.map((width) => ({ width })),
    });
    cursor.table(
        cols.map((c) => ({ header: String(c.Header ?? ""), key: c.accessor, num: numeric[c.accessor] })),
        rows,
        { totals: options.totals }
    );
    await saveWorkbook(wb, filename);
}
