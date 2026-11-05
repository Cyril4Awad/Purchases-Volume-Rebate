import moment from "moment";

/*
 * Printed reports share the contracts list report's look: a centred serif title, one meta
 * line, then plain grid tables. No colour, so they read the same on any printer. Sections are
 * kept apart and not split across pages where possible, so a long contract stays readable.
 */

export const esc = (v) => String(v ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

const CSS = `
  * { box-sizing: border-box; }
  body { font: 12px/1.45 "Segoe UI", system-ui, sans-serif; color: #101828; margin: 24px; }
  .company { font: 400 21px/1.2 "Segoe UI", system-ui, sans-serif; letter-spacing: .08em; text-transform: uppercase; text-align: center; margin: 0 0 6px; }
  h1 { font: 700 16px/1.2 "Segoe UI", system-ui, sans-serif; letter-spacing: .12em; text-transform: uppercase; text-align: center; margin: 0 0 6px; }
  .details { text-align: center; margin-bottom: 4px; }
  .printed { text-align: center; font-style: italic; font-size: 11px; color: #364153; padding-bottom: 12px; margin-bottom: 18px; border-bottom: 1px solid #d1d5dc; }
  h2 { font: 700 13px/1.2 Georgia, serif; letter-spacing: .05em; text-transform: uppercase; margin: 22px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #101828; }
  h3 { font: 700 12.5px/1.3 "Segoe UI", system-ui, sans-serif; margin: 16px 0 6px; }
  h3 small { font-weight: 400; color: #4a5565; margin-left: 6px; }
  .block { break-inside: avoid; page-break-inside: avoid; }
  .target { break-inside: avoid; page-break-inside: avoid; margin-bottom: 14px; padding: 10px 12px; border: 1px solid #d1d5dc; }
  .target h3 { margin-top: 0; }
  table { width: 100%; border-collapse: collapse; margin: 0 0 8px; }
  th, td { border: 1px solid #d1d5dc; padding: 5px 7px; text-align: left; vertical-align: top; }
  th { background: #f3f4f6; font-weight: 600; text-transform: uppercase; font-size: 10px; letter-spacing: .04em; text-align: center; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  tfoot td { font-weight: 700; border-top: 2px solid #101828; }
  table.fields td { width: 25%; }
  table.fields td.k { width: 16%; font-weight: 700; background: #f9fafb; }
  .note { color: #4a5565; font-style: italic; margin: 4px 0 8px; }
  .rule { margin: 4px 0 8px; }
  .or { text-align: center; font-weight: 700; font-size: 10px; letter-spacing: .08em; margin: 2px 0; }
  .strong { font-weight: 700; }
  @page { size: landscape; margin: 12mm; }
`;

/** Label/value grid, two pairs per line: [[label, value], ...] (values are escaped). */
export function fieldsTable(pairs) {
    const rows = [];
    for (let i = 0; i < pairs.length; i += 2) {
        const [a, b] = [pairs[i], pairs[i + 1]];
        rows.push(`<tr><td class="k">${esc(a[0])}</td><td${b ? "" : ' colspan="3"'}>${esc(a[1] ?? "-") || "-"}</td>${b ? `<td class="k">${esc(b[0])}</td><td>${esc(b[1] ?? "-") || "-"}</td>` : ""}</tr>`);
    }
    return `<table class="fields"><tbody>${rows.join("")}</tbody></table>`;
}

/** Grid table: columns [{ header, key, num }], rows of plain values (escaped), optional totals row. */
export function gridTable(columns, rows, { totals, emptyText = "Nothing to show." } = {}) {
    if (!rows.length) return `<p class="note">${esc(emptyText)}</p>`;
    const cell = (c, v, tag = "td") => `<${tag}${c.num ? ' class="num"' : ""}>${esc(v ?? "")}</${tag}>`;
    return `<table><thead><tr>${columns.map((c) => cell(c, c.header, "th")).join("")}</tr></thead>
<tbody>${rows.map((r) => `<tr${r.__bold ? ' class="strong"' : ""}>${columns.map((c) => cell(c, r[c.key])).join("")}</tr>`).join("")}</tbody>
${totals ? `<tfoot><tr>${columns.map((c) => cell(c, totals[c.key])).join("")}</tr></tfoot>` : ""}</table>`;
}

const userName = () => {
    try {
        const u = JSON.parse(localStorage.getItem("userData") ?? "null");
        return u?.userName || u?.userCode || "";
    } catch { return ""; }
};

/**
 * Opens the report in a new window and prints it. Header, as on every report: the
 * company name, the report's name, its details (period, filters), then who printed it and when.
 * body is trusted HTML built with the helpers above.
 */
export function openPrintWindow({ title, details, body, companyName = "" }) {
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}</style></head><body>
${companyName ? `<div class="company">${esc(companyName)}</div>` : ""}
<h1>${esc(title)}</h1>
${details ? `<div class="details">${esc(details)}</div>` : ""}
<div class="printed">Printed By ${esc(userName() || "-")} on ${esc(moment().format("DD/MM/YYYY hh:mm A"))}</div>
${body}
<script>window.onload = () => { window.focus(); window.print(); };</script>
</body></html>`;
    const win = window.open("", "_blank");
    if (!win) return false;
    win.document.open();
    win.document.write(html);
    win.document.close();
    return true;
}
