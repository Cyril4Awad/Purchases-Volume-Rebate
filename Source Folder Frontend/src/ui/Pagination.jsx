import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZES = [10, 25, 50, 100];

function pageList(page, pageCount) {
    if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
    const pages = new Set([1, pageCount, page, page - 1, page + 1]);
    if (page <= 3) [2, 3, 4].forEach((p) => pages.add(p));
    if (page >= pageCount - 2) [pageCount - 1, pageCount - 2, pageCount - 3].forEach((p) => pages.add(p));
    const sorted = [...pages].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);
    const out = [];
    sorted.forEach((p, i) => {
        if (i > 0 && p - sorted[i - 1] > 1) out.push("…");
        out.push(p);
    });
    return out;
}

/** "Rows per page · 1-25 of 132 · ‹ 1 2 3 › " */
export default function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange, pageSizes = PAGE_SIZES, compact = false }) {
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const to = Math.min(total, page * pageSize);

    return (
        <div className={`ds-pagination${compact ? " is-compact" : ""}`}>
            {onPageSizeChange && (
                <label className="ds-pagination-size">
                    <span>Rows per page</span>
                    <select
                        className="ds-field ds-field-sm"
                        value={pageSize}
                        onChange={(e) => onPageSizeChange(Number(e.target.value))}
                    >
                        {pageSizes.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                </label>
            )}
            <span className="ds-pagination-range">
                {total === 0 ? "No results" : `${from.toLocaleString()} to ${to.toLocaleString()} of ${total.toLocaleString()}`}
            </span>
            <div className="ds-pagination-pages">
                <button
                    type="button"
                    className="ds-page-btn"
                    onClick={() => onPageChange(page - 1)}
                    disabled={page <= 1}
                    aria-label="Previous page"
                >
                    <ChevronLeft size={16} />
                </button>
                {!compact && pageList(page, pageCount).map((p, i) => (
                    p === "…"
                        ? <span key={`gap${i}`} className="ds-page-gap">…</span>
                        : (
                            <button
                                key={p}
                                type="button"
                                className={`ds-page-btn${p === page ? " is-current" : ""}`}
                                onClick={() => onPageChange(p)}
                                aria-current={p === page ? "page" : undefined}
                            >
                                {p}
                            </button>
                        )
                ))}
                <button
                    type="button"
                    className="ds-page-btn"
                    onClick={() => onPageChange(page + 1)}
                    disabled={page >= pageCount}
                    aria-label="Next page"
                >
                    <ChevronRight size={16} />
                </button>
            </div>
        </div>
    );
}
