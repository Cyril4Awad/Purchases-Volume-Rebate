import { useMemo, useState } from "react";
import moment from "moment";
import { BadgeCheck, CalendarClock, Receipt, Target } from "lucide-react";
import { fmtRebateAmount } from "./computationDisplayUtils";
import "./breakdownMasterDetail.css";

/*
 * Month by month, laid out like the reference project's fees / total breakdowns: the months on
 * the left (bar + amount, upcoming months greyed), and on the right what the selected month asks
 * for: every fee / target line with its status (paid, due, upcoming) and the month's total.
 *
 * months: [{ key: "YYYY-MM", label, total, contributors: [{ kind: "fee" | "target", id, name,
 *            cadence?, rate?, amount, isPaid? }], isPaid?, paidStatus?, paidAmount?, outstandingAmount? }]
 */

const STATUS = {
    paid: { label: "Paid", cls: "is-active", Icon: BadgeCheck },
    partial: { label: "Partly paid", cls: "is-edited", Icon: CalendarClock },
    due: { label: "Due", cls: "is-edited", Icon: CalendarClock },
    upcoming: { label: "Upcoming", cls: "is-inactive", Icon: CalendarClock },
};

function monthStatus(month, nowKey) {
    const paid = month?.paidStatus ?? (month?.isPaid ? "full" : "none");
    if (paid === "full") return "paid";
    if (paid === "partial") return "partial";
    return month.key > nowKey ? "upcoming" : "due";
}

function lineSubtitle(c) {
    if (c.kind === "fee") {
        const cadence = String(c.cadence ?? "").trim();
        return cadence ? `Fee · ${cadence}` : "Fee";
    }
    const rate = String(c.rate ?? "").trim();
    return rate ? `Rebate · ${rate}` : "Rebate";
}

export default function BreakdownMonthMasterDetail({
    months = [],
    currency = "USD",
    emptyMessage = "No periods in this range.",
    detailTotalCaption = "Total due",
    tone = "total", // "fees" | "total": bar colour
}) {
    const nowKey = moment().format("YYYY-MM");
    const [onlyWithAmount, setOnlyWithAmount] = useState(true);
    const [selectedKey, setSelectedKey] = useState(null);

    const shown = useMemo(
        () => (onlyWithAmount ? months.filter((m) => Number(m.total) > 0) : months),
        [months, onlyWithAmount]
    );
    const max = Math.max(0, ...shown.map((m) => Math.abs(Number(m.total) || 0)));

    const fallback = shown.find((m) => Number(m.total) > 0 && m.key >= nowKey)
        ?? [...shown].reverse().find((m) => Number(m.total) > 0)
        ?? shown[0];
    const current = shown.find((m) => m.key === selectedKey) ?? fallback ?? null;
    const currentStatus = current ? monthStatus(current, nowKey) : null;
    const money = (v) => fmtRebateAmount(v, currency);

    if (!months.length) return <div className="bmd-empty">{emptyMessage}</div>;

    const lines = (current?.contributors ?? []).map((c) => ({
        ...c,
        status: c.isPaid ? "paid" : currentStatus === "upcoming" ? "upcoming" : "due",
    }));
    const counts = ["due", "upcoming", "paid"]
        .map((s) => [s, lines.filter((l) => l.status === s).length])
        .filter(([, n]) => n > 0);

    return (
        <div className="bmd-layout">
            <div className="bmd-side">
                <label className="bmd-check">
                    <input type="checkbox" className="form-check-input m-0" checked={onlyWithAmount} onChange={(e) => setOnlyWithAmount(e.target.checked)} />
                    Only months with an amount
                </label>
                <div className="bmd-months" role="listbox" aria-label="Months">
                    {shown.map((m) => {
                        const status = monthStatus(m, nowKey);
                        const isSel = current?.key === m.key;
                        const total = Number(m.total) || 0;
                        return (
                            <button
                                key={m.key}
                                type="button"
                                role="option"
                                aria-selected={isSel}
                                className={`bmd-month is-${tone}${isSel ? " is-selected" : ""}${status === "upcoming" ? " is-upcoming" : ""}`}
                                onClick={() => setSelectedKey(m.key)}
                            >
                                <span className="bmd-month-label">
                                    {status === "paid" && <BadgeCheck size={13} className="bmd-paid-icon" />}
                                    {m.label}
                                </span>
                                <span className="bmd-month-track">
                                    <span style={{ width: `${max ? Math.max(total ? 2 : 0, (Math.abs(total) / max) * 100) : 0}%` }} />
                                </span>
                                <span className={`bmd-month-value${total ? "" : " is-muted"}`}>{money(total)}</span>
                            </button>
                        );
                    })}
                    {!shown.length && <div className="bmd-empty">No month has an amount.</div>}
                </div>
            </div>

            {current && (
                <div className="bmd-detail">
                    <div className="bmd-detail-head">
                        <div>
                            <div className="bmd-detail-total">{money(current.total)} <em>{currency}</em></div>
                            <div className="bmd-detail-month">
                                {current.label} · {detailTotalCaption}
                                {currentStatus && (
                                    <span className={`ds-badge ${STATUS[currentStatus].cls} ms-2`}>{STATUS[currentStatus].label}</span>
                                )}
                            </div>
                        </div>
                        <div className="bmd-detail-badges">
                            {counts.map(([s, n]) => (
                                <span key={s} className={`ds-badge ${STATUS[s].cls}`}>{n} {STATUS[s].label.toLowerCase()}</span>
                            ))}
                        </div>
                    </div>

                    {currentStatus === "partial" && (
                        <div className="bmd-split">
                            <div><span>Paid</span><strong className="is-success">{money(current.paidAmount)} <em>{currency}</em></strong></div>
                            <div><span>Still due</span><strong className="is-warning">{money(current.outstandingAmount)} <em>{currency}</em></strong></div>
                        </div>
                    )}

                    <div className="bmd-group">This month</div>
                    {lines.map((l, idx) => {
                        const S = STATUS[l.status];
                        const Icon = l.kind === "fee" ? Receipt : Target;
                        return (
                            <div key={`${current.key}-${l.kind}-${l.id ?? idx}`} className="bmd-line">
                                <span className={`bmd-line-icon is-${l.kind === "fee" ? "fee" : "target"}`}><Icon size={14} /></span>
                                <span className="bmd-line-name">
                                    {l.name}
                                    <small>{lineSubtitle(l)}</small>
                                </span>
                                <span className={`ds-badge ${S.cls} bmd-line-status`}><S.Icon size={12} /> {S.label}</span>
                                <span className="bmd-line-amount">{money(l.amount)} <em>{currency}</em></span>
                            </div>
                        );
                    })}
                    {!lines.length && <div className="bmd-empty-line">Nothing is due this month.</div>}

                    <div className="bmd-detail-foot">
                        <span>Total <small>this month</small></span>
                        <strong>{money(current.total)} <em>{currency}</em></strong>
                    </div>
                </div>
            )}
        </div>
    );
}

/** The 4-figure strip above a breakdown: [{ label, value, tone? }]. */
export function BreakdownSummary({ items = [], currency = "USD" }) {
    return (
        <div className="bmd-summary">
            {items.map((it) => (
                <div key={it.label}>
                    <span>{it.label}</span>
                    <strong className={it.tone ? `is-${it.tone}` : ""}>
                        {typeof it.value === "number" ? fmtRebateAmount(it.value, currency) : it.value}
                        {typeof it.value === "number" && <em> {currency}</em>}
                    </strong>
                </div>
            ))}
        </div>
    );
}
