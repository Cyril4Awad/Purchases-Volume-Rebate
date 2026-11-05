import React, { useEffect, useMemo, useState } from "react";
import moment from "moment";
import {
    BarChart3, Boxes, CalendarDays, CheckCircle2, Download, Layers, Package, RotateCcw, Truck, XCircle,
} from "lucide-react";
import { AdvancedTable, ModalComp, SelectComp } from "../../../ReusableComponents";
import Segmented from "../components/Segmented/Segmented";
import Pagination from "../../../ui/Pagination";
import usePagedRows from "../../../utils/usePagedRows";
import { apiClient, apiErrorMessage } from "../../../utils/apiClient";
import { getApiBase } from "../../../globals";
import exportTableToExcel from "../../../utils/exportTableToExcel";
import { buildMonthEndWindows, firstMetMonth } from "../../Computation/utils/salesBreakdownUtils";
import { isRangeTarget } from "../../../utils/computationEngine";
import { describeFormulaRule } from "../utils/targetSummary";
import "../../../ui/ui.css";
import "../styles/contractEditor.css";
import "./simulationBreakdown.css";
import { supplierCode } from "../../../utils/contractWorkspaceMappers";
import { fmtAmount, fmtRebateAmount } from "../../Computation/utils/computationDisplayUtils";

/*
 * Simulation breakdown of one target: where the purchases behind the rebate come from.
 * One request returns purchases per supplier × item × month (target window and the same
 * window a year earlier, scoped to the target's items / categories); everything else —
 * filters, months, suppliers, items — is pivoted here, so switching views is instant.
 */

const VIEWS = [
    { value: "month", label: "By month", icon: <CalendarDays size={14} /> },
    { value: "supplier", label: "By supplier", icon: <Truck size={14} /> },
    { value: "item", label: "By item", icon: <Package size={14} /> },
];

const num = (v) => Number(v) || 0;
const fmtLocale = (v, decimals = 2) => num(v).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
const fmt = (v, decimals = 2) => (decimals === 0 ? fmtLocale(v, 0) : fmtAmount(v));
const fmtQty = (v) => num(v).toLocaleString("en-US", { maximumFractionDigits: 3 });
// the unit shared by a set of purchase lines ("" when they mix units, e.g. PCS and KG)
const unitOf = (units) => {
    const set = new Set([...units].map((u) => String(u ?? "").trim()).filter(Boolean));
    return set.size === 1 ? [...set][0] : "";
};
const qtyWithUnit = (v, unit) => (unit ? `${fmtQty(v)} ${unit}` : fmtQty(v));
const pct = (v) => (v == null || !Number.isFinite(v) ? "–" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`);
const growthOf = (cur, prev) => (prev ? ((cur - prev) / Math.abs(prev)) * 100 : null);
const amountDecimals = (currency) => (currency === "LBP" ? 0 : 2);

const selectMenuProps = {
    menuPortalTarget: typeof document !== "undefined" ? document.body : undefined,
    menuPosition: "fixed",
    styles: { menuPortal: (base) => ({ ...base, zIndex: 10050 }) },
};

// "All" needs a non-empty value: the select's floating label only moves up when the
// value is non-empty, otherwise the "Supplier" label sits on top of "All suppliers".
const ALL_VALUE = "__all__";
const ALL = { value: ALL_VALUE, label: "All" };
const pickFilter = (o) => (o?.value && o.value !== ALL_VALUE ? o.value : "");

export default function SimulationBreakdownModal({
    open,
    onClose,
    target,
    evaluationResult,
    settlementDisplay,
    allClientIds = [],
    contract,
    contractCurrency,
    asOf,
}) {
    const currency = (contractCurrency || "USD").toUpperCase();
    const amountKey = currency === "LBP" ? "amountLBP" : "amountUSD";
    const decimals = amountDecimals(currency);
    const money = (v) => `${fmt(v, decimals)} ${currency}`;
    const rebateMoney = (v) => `${fmtRebateAmount(v, currency)} ${currency}`;

    const [state, setState] = useState({ status: "idle", data: null, error: null });
    const [view, setView] = useState("month");
    const [supplierId, setSupplierId] = useState("");
    const [stkId, setStkId] = useState("");
    const [categoryCode, setCategoryCode] = useState("");

    const fromKey = target?.fromDate ? moment(target.fromDate).format("YYYY-MM-DD") : "";
    const toKey = target?.toDate ? moment(target.toDate).format("YYYY-MM-DD") : "";
    const asOfKey = moment(asOf ?? undefined).format("YYYY-MM-DD");
    // purchases are counted up to the as-of date (simulation "today"), never past the target end
    const fetchToKey = useMemo(() => {
        if (!toKey) return "";
        const cap = moment(asOfKey).add(1, "day");
        return moment.min(moment(toKey), cap).format("YYYY-MM-DD");
    }, [toKey, asOfKey]);

    const scope = useMemo(() => {
        const refs = target?.references ?? [];
        return {
            stockIds: refs.filter((r) => r.referenceType === "StockItem").map((r) => Number(r.stkRecId)).filter(Boolean),
            categoryIds: refs.filter((r) => r.referenceType !== "StockItem").map((r) => Number(r.itemTypeRecId)).filter(Boolean),
        };
    }, [target?.references]);
    const scopeKey = `${scope.stockIds.join(",")}|${scope.categoryIds.join(",")}`;
    const clientsKey = (allClientIds ?? []).join(",");

    useEffect(() => {
        if (!open) return undefined;
        setSupplierId(""); setStkId(""); setCategoryCode(""); setView("month");
        if (!fromKey || !fetchToKey || !clientsKey || !moment(fetchToKey).isAfter(fromKey)) {
            setState({ status: "ready", data: { current: [], previous: [] }, error: null });
            return undefined;
        }
        let cancelled = false;
        setState({ status: "loading", data: null, error: null });
        apiClient.post(`${getApiBase()}/CVRComputation/breakdown`, {
            supCodes: allClientIds,
            fromDate: fromKey,
            toDate: fetchToKey,
            stockIds: scope.stockIds,
            categoryIds: scope.categoryIds,
        })
            .then(({ data }) => { if (!cancelled) setState({ status: "ready", data, error: null }); })
            .catch((err) => { if (!cancelled) setState({ status: "error", data: null, error: apiErrorMessage(err, "Couldn't load the breakdown.") }); });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, fromKey, fetchToKey, clientsKey, scopeKey]);

    const current = useMemo(() => state.data?.current ?? [], [state.data]);
    const previous = useMemo(() => state.data?.previous ?? [], [state.data]);

    // ── filter options ────────────────────────────────────────────────────────
    const supplierNames = useMemo(() => {
        const m = new Map();
        const add = (opt) => {
            const id = supplierCode(opt);
            if (id) m.set(id, { code: opt?.code || id, name: opt?.label ?? "" });
        };
        add(contract?.ClientID);
        (contract?.SubClients ?? []).forEach((s) => add(s.ClientID));
        [...current, ...previous].forEach((r) => {
            if (!m.get(r.supplierCode)?.name) m.set(r.supplierCode, { code: r.supplierCode, name: r.supplierName });
        });
        return m;
    }, [contract, current, previous]);

    const supplierOptions = useMemo(() => [
        { ...ALL, label: "All suppliers" },
        ...(allClientIds ?? []).map((id) => {
            const s = supplierNames.get(supplierCode(id));
            return { value: String(id), label: s ? `${s.code} - ${s.name}` : String(id) };
        }),
    ], [allClientIds, supplierNames]);

    const itemOptions = useMemo(() => {
        const m = new Map();
        [...current, ...previous].forEach((r) => {
            if (!m.has(r.stkId)) m.set(r.stkId, { value: String(r.stkId), label: `${r.itemRef} - ${r.itemDesc}` });
        });
        return [{ ...ALL, label: "All items" }, ...[...m.values()].sort((a, b) => a.label.localeCompare(b.label))];
    }, [current, previous]);

    const categoryOptions = useMemo(() => {
        const m = new Map();
        [...current, ...previous].forEach((r) => {
            if (r.categoryCode && !m.has(r.categoryCode)) {
                m.set(r.categoryCode, { value: r.categoryCode, label: `${r.categoryCode} - ${r.categoryDesc}` });
            }
        });
        return [{ ...ALL, label: "All categories" }, ...[...m.values()].sort((a, b) => a.label.localeCompare(b.label))];
    }, [current, previous]);

    const filtered = !!(supplierId || stkId || categoryCode);
    const keep = (r) =>
        (!supplierId || r.supplierCode === supplierId)
        && (!stkId || String(r.stkId) === stkId)
        && (!categoryCode || r.categoryCode === categoryCode);
    const cur = useMemo(() => current.filter(keep), [current, supplierId, stkId, categoryCode]); // eslint-disable-line react-hooks/exhaustive-deps
    const prev = useMemo(() => previous.filter(keep), [previous, supplierId, stkId, categoryCode]); // eslint-disable-line react-hooks/exhaustive-deps

    const totalAmount = useMemo(() => cur.reduce((s, r) => s + num(r[amountKey]), 0), [cur, amountKey]);
    const totalQty = useMemo(() => cur.reduce((s, r) => s + num(r.qty), 0), [cur]);
    const totalUnit = useMemo(() => unitOf(cur.map((r) => r.unit)), [cur]);
    const prevAmount = useMemo(() => prev.reduce((s, r) => s + num(r[amountKey]), 0), [prev, amountKey]);
    const totalGrowth = growthOf(totalAmount, prevAmount);

    // ── by month ──────────────────────────────────────────────────────────────
    const windows = useMemo(
        () => (fromKey && toKey ? buildMonthEndWindows(fromKey, toKey, asOfKey) : []),
        [fromKey, toKey, asOfKey]
    );

    const monthRows = useMemo(() => {
        const sumBy = (rows, key) => rows.reduce((acc, r) => {
            const k = r.monthKey;
            const a = acc[k] ?? (acc[k] = { amount: 0, usd: 0, lbp: 0, qty: 0, units: new Set() });
            a.amount += num(r[key]); a.usd += num(r.amountUSD); a.lbp += num(r.amountLBP); a.qty += num(r.qty);
            a.units.add(r.unit);
            return acc;
        }, {});
        const curBy = sumBy(cur, amountKey);
        const prevBy = sumBy(prev, amountKey);
        let cum = { amount: 0, usd: 0, lbp: 0, qty: 0, pUsd: 0, pLbp: 0 };
        return windows.map((w, i) => {
            const c = curBy[w.key] ?? { amount: 0, usd: 0, lbp: 0, qty: 0 };
            const p = prevBy[moment(w.key, "YYYY-MM").subtract(1, "year").format("YYYY-MM")] ?? { amount: 0, usd: 0, lbp: 0, qty: 0 };
            cum = {
                amount: cum.amount + c.amount, usd: cum.usd + c.usd, lbp: cum.lbp + c.lbp, qty: cum.qty + c.qty,
                pUsd: cum.pUsd + p.usd, pLbp: cum.pLbp + p.lbp,
            };
            return {
                index: i, key: w.key, label: w.label, isPartial: w.isPartial, toDate: w.toDate,
                amount: c.amount, qty: c.qty, unit: unitOf(c.units ?? []), prevAmount: p.amount, cumAmount: cum.amount,
                // what the engine needs to re-evaluate the target at this month's end
                sales: {
                    salesAmounts: { USD: cum.usd, LBP: cum.lbp },
                    salesAmount: cum.usd,
                    salesAmountBase: cum.usd,
                    salesQuantity: cum.qty,
                    previousYearSalesAmounts: { USD: cum.pUsd, LBP: cum.pLbp },
                    growthPercentageUSD: cum.pUsd ? ((cum.usd - cum.pUsd) / cum.pUsd) * 100 : 0,
                },
            };
        });
    }, [windows, cur, prev, amountKey]);

    // The month the rule is first met — only meaningful on the whole contract (no filter).
    const earnedIndex = useMemo(() => {
        if (filtered || !target || !monthRows.length) return -1;
        const conditioned = isRangeTarget(target) || (target.conditionGroups ?? []).some((g) => (g.conditions ?? []).some((c) => c.conditionType));
        if (!conditioned) return -1;
        try { return firstMetMonth(target, monthRows.map((m) => ({ toDate: m.toDate, sales: m.sales })), currency); } catch { return -1; }
    }, [filtered, target, monthRows, currency]);

    const monthMax = Math.max(1, ...monthRows.map((m) => Math.max(Math.abs(m.amount), Math.abs(m.prevAmount))));

    // ── by supplier ───────────────────────────────────────────────────────────
    const supplierRows = useMemo(() => {
        const m = new Map();
        const ids = supplierId ? [supplierId] : (allClientIds ?? []).map(supplierCode).filter(Boolean);
        ids.forEach((id) => m.set(id, { supplierId: id, amount: 0, qty: 0, prevAmount: 0, items: new Set(), units: new Set() }));
        cur.forEach((r) => {
            const a = m.get(r.supplierCode) ?? m.set(r.supplierCode, { supplierId: r.supplierCode, amount: 0, qty: 0, prevAmount: 0, items: new Set(), units: new Set() }).get(r.supplierCode);
            a.amount += num(r[amountKey]); a.qty += num(r.qty); a.items.add(r.stkId); a.units.add(r.unit);
        });
        prev.forEach((r) => { const a = m.get(r.supplierCode); if (a) a.prevAmount += num(r[amountKey]); });
        return [...m.values()].map((a) => {
            const s = supplierNames.get(a.supplierId);
            return {
                ...a,
                code: s?.code ?? "",
                name: s?.name || a.supplierId,
                itemCount: a.items.size,
                unit: unitOf(a.units),
                share: totalAmount ? (a.amount / totalAmount) * 100 : 0,
                growth: growthOf(a.amount, a.prevAmount),
            };
        }).sort((x, y) => y.amount - x.amount);
    }, [cur, prev, amountKey, allClientIds, supplierId, supplierNames, totalAmount]);

    // ── by item ───────────────────────────────────────────────────────────────
    const itemRows = useMemo(() => {
        const m = new Map();
        cur.forEach((r) => {
            const a = m.get(r.stkId) ?? m.set(r.stkId, {
                stkId: r.stkId, itemRef: r.itemRef, itemDesc: r.itemDesc, category: r.categoryCode,
                categoryDesc: r.categoryDesc, unit: r.unit ?? "", amount: 0, qty: 0, prevAmount: 0, suppliers: new Set(),
            }).get(r.stkId);
            a.amount += num(r[amountKey]); a.qty += num(r.qty); a.suppliers.add(r.supplierCode);
        });
        prev.forEach((r) => { const a = m.get(r.stkId); if (a) a.prevAmount += num(r[amountKey]); });
        return [...m.values()]
            .map((a) => ({ ...a, supplierCount: a.suppliers.size, share: totalAmount ? (a.amount / totalAmount) * 100 : 0 }))
            .sort((x, y) => y.amount - x.amount);
    }, [cur, prev, amountKey, totalAmount]);

    // long lists render a page at a time (rendering thousands of rows froze the modal)
    const itemPaging = usePagedRows(itemRows, (r) => `${r.itemRef} ${r.itemDesc} ${r.category} ${r.categoryDesc}`);
    const supplierPaging = usePagedRows(supplierRows, (r) => `${r.code} ${r.name}`);

    // ── rule status (from the engine's evaluation of the whole contract) ───────
    const rebateAmount = settlementDisplay?.currentTotal ?? evaluationResult?.rebateAmount ?? 0;
    const owedAmount = settlementDisplay?.owedAmount ?? 0;
    const range = isRangeTarget(target);
    const groups = evaluationResult?.groupResults ?? [];
    const tiers = evaluationResult?.tierResults ?? [];
    const achieved = Number(rebateAmount) > 0;
    const ruleText = range ? null : describeFormulaRule(target ?? {}, currency);

    // ── export the view on screen ─────────────────────────────────────────────
    const exportView = () => {
        const name = `${target?.targetName || "Target"} - breakdown by ${view}`;
        if (view === "month") {
            exportTableToExcel(
                [{ Header: "Month", accessor: "label" }, { Header: `Purchases (${currency})`, accessor: "amount" },
                    { Header: "Quantity", accessor: "qty" }, { Header: `Previous year (${currency})`, accessor: "prevAmount" },
                    { Header: `Cumulative (${currency})`, accessor: "cumAmount" }],
                monthRows.map((m) => ({ ...m, amount: fmt(m.amount, decimals), prevAmount: fmt(m.prevAmount, decimals), cumAmount: fmt(m.cumAmount, decimals), qty: qtyWithUnit(m.qty, m.unit) })),
                name, "By month"
            );
        } else if (view === "supplier") {
            exportTableToExcel(
                [{ Header: "Supplier Code", accessor: "code" }, { Header: "Supplier Name", accessor: "name" },
                    { Header: `Purchases (${currency})`, accessor: "amount" }, { Header: "Quantity", accessor: "qty" },
                    { Header: "Share", accessor: "share" }, { Header: `Previous year (${currency})`, accessor: "prevAmount" },
                    { Header: "Growth", accessor: "growth" }],
                supplierRows.map((s) => ({ ...s, amount: fmt(s.amount, decimals), qty: qtyWithUnit(s.qty, s.unit), share: `${s.share.toFixed(1)}%`, prevAmount: fmt(s.prevAmount, decimals), growth: pct(s.growth) })),
                name, "By supplier"
            );
        } else {
            exportTableToExcel(
                [{ Header: "Item Reference", accessor: "itemRef" }, { Header: "Description", accessor: "itemDesc" },
                    { Header: "Category", accessor: "category" }, { Header: "Quantity", accessor: "qty" },
                    { Header: `Purchases (${currency})`, accessor: "amount" }, { Header: "Share", accessor: "share" }],
                itemRows.map((r) => ({ ...r, amount: fmt(r.amount, decimals), qty: qtyWithUnit(r.qty, r.unit), share: `${r.share.toFixed(1)}%` })),
                name, "By item"
            );
        }
    };

    // ── table columns ─────────────────────────────────────────────────────────
    const shareCell = (value) => (
        <div className="sb-share">
            <span className="sb-share-bar"><span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></span>
            <span className="sb-share-val">{value.toFixed(1)}%</span>
        </div>
    );

    const supplierColumns = useMemo(() => [
        { Header: "Supplier Code", accessor: "code", minWidth: 120, Cell: (c) => <div className="sb-center ds-mono">{c.value}</div> },
        { Header: "Supplier Name", accessor: "name", minWidth: 220, Cell: (c) => (
            <div className="sb-center sb-cell-text" title={c.value}><strong>{c.value}</strong>
                {c.original.supplierId === supplierCode(contract?.ClientID) && <span className="ds-badge is-new ms-2">Master</span>}</div>
        ) },
        { Header: "Purchases", accessor: "amount", minWidth: 170, Cell: (c) => <div className="sb-num"><strong>{money(c.value)}</strong></div> },
        { Header: "Quantity", accessor: "qty", minWidth: 130, Cell: (c) => <div className="sb-num">{qtyWithUnit(c.value, c.original.unit)}</div> },
        { Header: "Items", accessor: "itemCount", minWidth: 90, Cell: (c) => <div className="sb-num">{c.value}</div> },
        { Header: "Share", accessor: "share", minWidth: 170, Cell: (c) => shareCell(c.value) },
        { Header: "Previous year", accessor: "prevAmount", minWidth: 170, Cell: (c) => <div className="sb-num sb-muted">{money(c.value)}</div> },
        { Header: "Growth", accessor: "growth", minWidth: 100, Cell: (c) => <div className={`sb-num ${c.value == null ? "sb-muted" : c.value >= 0 ? "sb-pos" : "sb-neg"}`}>{pct(c.value)}</div> },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    ], [currency, decimals, contract]);

    const itemColumns = useMemo(() => [
        { Header: "Item Reference", accessor: "itemRef", minWidth: 140, Cell: (c) => <div className="sb-center ds-mono">{c.value}</div> },
        { Header: "Description", accessor: "itemDesc", minWidth: 240, Cell: (c) => <div className="sb-cell-text" title={c.value}><strong>{c.value}</strong></div> },
        { Header: "Category", accessor: "category", minWidth: 170, Cell: (c) => <div className="sb-cell-text sb-muted">{c.value} {c.original.categoryDesc ? `· ${c.original.categoryDesc}` : ""}</div> },
        { Header: "Quantity", accessor: "qty", minWidth: 130, Cell: (c) => <div className="sb-num">{qtyWithUnit(c.value, c.original.unit)}</div> },
        { Header: "Purchases", accessor: "amount", minWidth: 170, Cell: (c) => <div className="sb-num"><strong>{money(c.value)}</strong></div> },
        { Header: "Share", accessor: "share", minWidth: 170, Cell: (c) => shareCell(c.value) },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    ], [currency, decimals]);

    // ── render ────────────────────────────────────────────────────────────────
    const periodLabel = fromKey && toKey
        ? `${moment(fromKey).format("DD/MM/YYYY")} → ${moment(toKey).subtract(1, "day").format("DD/MM/YYYY")}`
        : "";

    const body = (
        <div className="sb">
            {/* header strip */}
            <div className="sb-head">
                <div className="sb-head-main">
                    <div className="sb-head-title">{evaluationResult?.targetName ?? target?.targetName ?? "Target"}</div>
                    <div className="sb-head-meta">
                        <span><CalendarDays size={14} /> {periodLabel}</span>
                        <span>
                            {(target?.references ?? []).length
                                ? <><Layers size={14} /> {scope.categoryIds.length} {scope.categoryIds.length === 1 ? "category" : "categories"} · {scope.stockIds.length} {scope.stockIds.length === 1 ? "item" : "items"}</>
                                : <><Boxes size={14} /> All items</>}
                        </span>
                    </div>
                    {ruleText && <div className="sb-head-rule">{ruleText}</div>}
                </div>
                <span className={`sb-pill ${achieved ? "is-ok" : "is-wait"}`}>
                    {achieved ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                    {achieved ? "Rebate earned" : "Not reached yet"}
                </span>
            </div>

            {/* KPIs (filtered figures are labelled as such) */}
            <div className="sb-kpis">
                <div className="sb-kpi">
                    <span className="sb-kpi-label">{filtered ? "Purchases (filtered)" : "Purchases"}</span>
                    <span className="sb-kpi-value">{money(totalAmount)}</span>
                    <span className="sb-kpi-sub">{qtyWithUnit(totalQty, totalUnit || "units")}</span>
                </div>
                <div className="sb-kpi">
                    <span className="sb-kpi-label">Previous year</span>
                    <span className="sb-kpi-value">{money(prevAmount)}</span>
                    <span className={`sb-kpi-sub ${totalGrowth == null ? "" : totalGrowth >= 0 ? "sb-pos" : "sb-neg"}`}>{totalGrowth == null ? "No purchases last year" : `${pct(totalGrowth)} growth`}</span>
                </div>
                <div className="sb-kpi is-accent">
                    <span className="sb-kpi-label">Rebate</span>
                    <span className="sb-kpi-value">{rebateMoney(rebateAmount)}</span>
                    <span className="sb-kpi-sub">whole contract</span>
                </div>
                <div className="sb-kpi">
                    <span className="sb-kpi-label">Currently owed</span>
                    <span className="sb-kpi-value">{rebateMoney(owedAmount)}</span>
                    <span className="sb-kpi-sub">as of {moment(asOfKey).format("DD/MM/YYYY")}</span>
                </div>
            </div>

            {/* rule progress */}
            {!range && groups.length > 0 && (
                <div className="sb-rule">
                    {groups.map((g, gi) => (
                        <React.Fragment key={g.groupId ?? gi}>
                            {gi > 0 && <div className="sb-rule-or">OR</div>}
                            <div className={`sb-rule-set ${g.passed ? "is-ok" : ""}`}>
                                {(g.conditionResults ?? []).map((c, ci) => {
                                    const req = num(c.required);
                                    const act = num(c.actual);
                                    const atMost = String(c.operator ?? "").includes("<");
                                    const ratio = req ? Math.max(0, Math.min(1, act / req)) : (c.passed ? 1 : 0);
                                    const unit = c.conditionType === "G" ? "%" : c.conditionType === "Q" ? "units" : currency;
                                    const show = (v) => (c.conditionType === "Q" ? fmtQty(v) : fmt(v, c.conditionType === "G" ? 2 : decimals));
                                    return (
                                        <div key={ci} className="sb-cond">
                                            <div className="sb-cond-top">
                                                <span>{c.label} {c.operator} {show(req)} {unit}</span>
                                                <span className={c.passed ? "sb-pos" : "sb-neg"}>
                                                    {show(act)} {unit} {c.passed ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                                                </span>
                                            </div>
                                            {!atMost && <div className="sb-progress"><span className={c.passed ? "is-ok" : ""} style={{ width: `${ratio * 100}%` }} /></div>}
                                        </div>
                                    );
                                })}
                            </div>
                        </React.Fragment>
                    ))}
                </div>
            )}
            {range && tiers.length > 0 && (
                <div className="sb-tiers">
                    {tiers.map((t, i) => {
                        const type = target?.tierConditionType;
                        const unit = type === "G" ? "%" : type === "Q" ? "units" : currency;
                        const current = evaluationResult?.matchedTier != null && Number(evaluationResult.matchedTier.value) === Number(t.value);
                        const reward = String(t.rebateValueType ?? "").toUpperCase() === "P"
                            ? `${fmt(t.rebateValue, 2)}%`
                            : money(t.rebateValue);
                        return (
                            <div key={i} className={`sb-tier ${t.exceeded ? "is-ok" : ""} ${current ? "is-current" : ""}`}>
                                <span className="sb-tier-name">Tier {i + 1}{current && " · current"}</span>
                                <span className="sb-tier-req">&gt; {type === "Q" ? fmtQty(t.value) : fmt(t.value, type === "G" ? 2 : decimals)} {unit}</span>
                                <span className="sb-tier-reward">{reward}</span>
                                <span className="sb-tier-state">{t.exceeded ? <CheckCircle2 size={14} /> : null}</span>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* filters + view switch */}
            <div className="sb-toolbar">
                <div className="sb-filters">
                    <div className="sb-filter">
                        <SelectComp name="sbSupplier" value={(supplierId && supplierOptions.find((o) => o.value === supplierId)) || supplierOptions[0]}
                            options={supplierOptions} onChange={(o) => setSupplierId(pickFilter(o))} placeholder="Supplier" {...selectMenuProps} />
                    </div>
                    <div className="sb-filter">
                        <SelectComp name="sbCategory" value={(categoryCode && categoryOptions.find((o) => o.value === categoryCode)) || categoryOptions[0]}
                            options={categoryOptions} onChange={(o) => setCategoryCode(pickFilter(o))} placeholder="Category" {...selectMenuProps} />
                    </div>
                    <div className="sb-filter is-wide">
                        <SelectComp name="sbItem" value={(stkId && itemOptions.find((o) => o.value === stkId)) || itemOptions[0]}
                            options={itemOptions} onChange={(o) => setStkId(pickFilter(o))} placeholder="Item" {...selectMenuProps} />
                    </div>
                    {filtered && (
                        <button type="button" className="ds-btn ds-btn-ghost ce-btn-sm" onClick={() => { setSupplierId(""); setStkId(""); setCategoryCode(""); }}>
                            <RotateCcw size={14} /> Clear
                        </button>
                    )}
                </div>
                <Segmented value={view} options={VIEWS} onChange={setView} />
            </div>

            <div className="sb-view">
            {state.status === "loading" && <div className="sb-empty"><span className="spinner-border spinner-border-sm me-2" />Loading purchases…</div>}
            {state.status === "error" && <div className="sb-empty sb-neg">{state.error}</div>}

            {state.status === "ready" && view === "month" && (
                monthRows.length === 0 ? <div className="sb-empty">No months in this period yet.</div> : (
                    <div className="sb-months">
                        <div className="sb-months-scroll">
                        <div className="sb-months-head">
                            <span>Month</span><span>Purchases</span><span className="sb-num">Qty</span><span className="sb-num">Previous year</span><span className="sb-num">Cumulative</span>
                        </div>
                        {monthRows.map((m) => (
                            <div key={m.key} className={`sb-month ${m.index === earnedIndex ? "is-earned" : ""}`}>
                                <span className="sb-month-label">
                                    {m.label}
                                    {m.isPartial && <span className="sb-muted"> · to date</span>}
                                    {m.index === earnedIndex && <span className="ds-badge is-new ms-2">Rebate earned</span>}
                                </span>
                                <span className="sb-month-bars">
                                    <span className="sb-bar"><span className={m.amount < 0 ? "is-neg" : ""} style={{ width: `${(Math.abs(m.amount) / monthMax) * 100}%` }} /></span>
                                    <span className="sb-bar is-prev"><span style={{ width: `${(Math.abs(m.prevAmount) / monthMax) * 100}%` }} /></span>
                                    <span className="sb-month-amount">{money(m.amount)}</span>
                                </span>
                                <span className="sb-num">{qtyWithUnit(m.qty, m.unit)}</span>
                                <span className="sb-num sb-muted">{money(m.prevAmount)}</span>
                                <span className="sb-num"><strong>{money(m.cumAmount)}</strong></span>
                            </div>
                        ))}
                        <div className="sb-month is-total">
                            <span className="sb-month-label">Total</span>
                            <span className="sb-num"><strong>{money(totalAmount)}</strong></span>
                            <span className="sb-num">{qtyWithUnit(totalQty, totalUnit)}</span>
                            <span className="sb-num sb-muted">{money(prevAmount)}</span>
                            <span className="sb-num" />
                        </div>
                        </div>
                        <div className="sb-legend">
                            <span><i className="sb-dot" /> This period</span>
                            <span><i className="sb-dot is-prev" /> Same month last year</span>
                            {filtered && <span className="sb-muted">Filtered view: the rebate month is shown on the whole contract only.</span>}
                        </div>
                    </div>
                )
            )}

            {state.status === "ready" && view === "supplier" && (
                <>
                    <div className="adv-mobile-table sb-table">
                        <AdvancedTable maxHeight="none" columns={supplierColumns} dataArray={supplierPaging.pageRows} enableSearch isFilterOptionOneRow
                            triggerPaging={supplierPaging.onSearch} hidePager minRows={0} showPagination={false}
                            recordCount={supplierPaging.total} pageSize={supplierPaging.pageSize} currentPage={supplierPaging.page} />
                    </div>
                    <Pagination page={supplierPaging.page} pageSize={supplierPaging.pageSize} total={supplierPaging.total}
                        onPageChange={supplierPaging.setPage} onPageSizeChange={supplierPaging.setPageSize} />
                </>
            )}

            {state.status === "ready" && view === "item" && (
                itemRows.length === 0 ? <div className="sb-empty">No purchases for these filters.</div> : (
                    <>
                        <div className="adv-mobile-table sb-table">
                            <AdvancedTable maxHeight="none" columns={itemColumns} dataArray={itemPaging.pageRows} enableSearch isFilterOptionOneRow
                                triggerPaging={itemPaging.onSearch} hidePager minRows={0} showPagination={false}
                                recordCount={itemPaging.total} pageSize={itemPaging.pageSize} currentPage={itemPaging.page} />
                        </div>
                        <Pagination page={itemPaging.page} pageSize={itemPaging.pageSize} total={itemPaging.total}
                            onPageChange={itemPaging.setPage} onPageSizeChange={itemPaging.setPageSize} />
                    </>
                )
            )}
            </div>

            <div className="picker-modal-footer">
                <button type="button" className="ds-btn ds-btn-secondary me-auto" onClick={exportView} disabled={state.status !== "ready"}>
                    <Download size={16} /> Export view
                </button>
                <button type="button" className="ds-btn ds-btn-primary" onClick={onClose}>
                    <BarChart3 size={16} /> Done
                </button>
            </div>
        </div>
    );

    return (
        <ModalComp
            modal={!!open}
            modalTitle="Purchase breakdown"
            modalBody={body}
            onClose={onClose}
            hideFooterButtons
            showCloseIcon
            size="xl"
            className="picker-modal sb-modal"
        />
    );
}
