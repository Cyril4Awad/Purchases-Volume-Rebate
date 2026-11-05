import moment from "moment";
import { isRangeTarget, resolveTargetSalesKey } from "./computationEngine";
import { saveWorkbook, startSheet } from "./excelBrand";
import { esc, fieldsTable, gridTable, openPrintWindow } from "./printBrand";
import {
    buildSettlementTypesMap,
    getFeeSettlementDisplay,
    getTargetSettlementDisplay,
    sumSettlementTotals,
} from "./settlementPaymentLogic";
import {
    EMPTY_SALES,
    fmtRebateAmount,
    formatMetricAmount,
    mapConditionRow,
    resolveSettlementTypeLabel,
} from "../Forms/Computation/utils/computationDisplayUtils";

/*
 * The computation as one document, shared by the Excel export and the printed report (same
 * structure as the reference project's computation report): the contract, the totals, the
 * fees, each target (figures, rate, conditions or tiers) and the settlements made. Built from
 * the figures the screen shows, so nothing is fetched again.
 */

const date = (d) => (d && moment(d).isValid() ? moment(d).format("DD/MM/YYYY") : "-");
const stamp = (d) => (d && moment(d).isValid() ? moment(d).format("DD/MM/YYYY HH:mm") : "-");
const pct = (v) => `${Number(v ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
const qty = (v) => Number(v ?? 0).toLocaleString("en-US", { maximumFractionDigits: 3 });
const STATE = { achieved: "Achieved", missed: "Missed", progress: "In progress", inprogress: "In progress" };
const stateLabel = (s) => STATE[String(s ?? "").replace(/[\s_-]/g, "").toLowerCase()] ?? (s || "-");

function rateText(rule, currency) {
    const type = String(rule?.rebateValueType ?? "F").trim().toUpperCase();
    return type === "P"
        ? `${Number(rule?.rebateValue ?? 0).toLocaleString("en-US", { maximumFractionDigits: 4 })}% of purchases`
        : `${fmtRebateAmount(rule?.rebateValue, currency)} ${currency}`;
}

export function describeComputation({
    resolved, previewResults, salesByTargetId = {}, salesMetaByTargetId = {}, payments = [],
    contractCurrency, locked = false, lastAccountingGenerationDate = null,
}) {
    const currency = contractCurrency ?? resolved?.contractCurrency ?? "USD";
    const m = (v) => `${fmtRebateAmount(v, currency)} ${currency}`;
    const cd = resolved?.contract ?? {};
    const targets = resolved?.targets ?? [];
    const fees = resolved?.fees ?? [];
    const results = previewResults?.targetResults ?? [];
    const settMap = buildSettlementTypesMap(resolved?.settlementTypeOptions ?? []);
    const settlementLabel = (id) => resolveSettlementTypeLabel(id, settMap) || "-";

    const totals = sumSettlementTotals({ targets, targetResults: results, salesByTargetId, fees, payments, contractCurrency: currency });

    let fetchedAt = null;
    Object.values(salesMetaByTargetId ?? {}).forEach((meta) => {
        const t = meta?.fetchedAt ? moment(meta.fetchedAt) : null;
        if (t?.isValid() && (!fetchedAt || t.isAfter(fetchedAt))) fetchedAt = t;
    });

    const feeRows = fees.map((f) => {
        const d = getFeeSettlementDisplay({ fee: f, payments, contractCurrency: currency });
        return {
            name: f.typeLabel || "Fee",
            settlement: settlementLabel(f.settlementTypeId),
            amount: fmtRebateAmount(f.amount, currency),
            settled: fmtRebateAmount(d.settledAmount, currency),
            owed: fmtRebateAmount(d.owedAmount, currency),
        };
    });

    const targetDocs = results.map((r, i) => {
        const key = String(r.targetId ?? "");
        const t = targets.find((x) => resolveTargetSalesKey(x) === key) ?? {};
        const sales = salesByTargetId[key] ?? EMPTY_SALES;
        const amount = sales.salesAmounts?.[currency] ?? sales.salesAmountBase ?? sales.salesAmount ?? 0;
        const prev = sales.previousYearSalesAmounts?.[currency] ?? 0;
        const settlement = getTargetSettlementDisplay({ target: t, targetResult: r, sales, contractCurrency: currency, payments });
        const range = isRangeTarget(t);
        const refs = t.references ?? [];
        const tiers = (r.tierResults ?? []).map((x, n) => ({
            tier: `Tier ${n + 1}`,
            above: t.tierConditionType === "Q" ? qty(x.value) : t.tierConditionType === "G" ? pct(x.value) : m(x.value),
            rebate: rateText(x, currency),
            reached: x.exceeded ? "Yes" : "No",
        }));
        const groups = (r.groupResults ?? []).map((g, gi) => ({
            set: gi + 1,
            passed: !!g.passed,
            rows: (g.conditionResults ?? []).map((c) => {
                const row = mapConditionRow(c);
                return { metric: row.label, required: row.required, actual: row.actual, met: row.result };
            }),
        }));
        const name = r.targetName || t.targetName || `Target ${i + 1}`;
        return {
            n: i + 1,
            name,
            status: stateLabel(r.state),
            rebate: m(settlement.currentTotal ?? r.rebateAmount),
            fields: [
                ["Period", `${date(t.fromDate)} to ${date(t.toDate ? moment(t.toDate).subtract(1, "day") : null)}`],
                ["Status", stateLabel(r.state)],
                ["Settlement", settlementLabel(t.settlementTypeId)],
                ["Rebate rate", range ? (r.matchedTier ? `Tier reached: ${rateText(r.matchedTier, currency)}` : "No tier reached") : rateText(t, currency)],
                ["Purchases", `${formatMetricAmount(amount, currency)} ${currency}`],
                ["Previous year", `${formatMetricAmount(prev, currency)} ${currency}`],
                ["Growth", pct(sales.growthPercentageUSD)],
                ["Quantity", qty(sales.salesQuantity)],
                ["Item scope", refs.length ? `${refs.length} ${refs.length === 1 ? "reference" : "references"}` : "All items"],
                ["Rule", range ? "Tiers" : groups.length ? "Conditions" : "Always applies"],
                ["Rebate", m(settlement.currentTotal ?? r.rebateAmount)],
                ["Settled", m(settlement.settledAmount)],
                ["Owed", m(settlement.owedAmount)],
            ],
            range,
            tiers,
            groups,
        };
    });

    const nameOf = (p) => (p.resultType === "F"
        ? fees.find((f) => String(f.feeId ?? f.feeID) === String(p.feeId))?.typeLabel || "Fee"
        : targets.find((t) => String(t.targetId ?? t.targetID) === String(p.targetId))?.targetName || "Target");
    const settlements = (payments ?? []).map((p) => ({
        processed: date(p.processDate),
        item: nameOf(p),
        covers: p.periodStart && p.periodEnd ? `${date(p.periodStart)} to ${date(p.periodEnd)}` : "-",
        amount: `${fmtRebateAmount(p.amountProcessed, p.currency || currency)} ${p.currency || currency}`,
    }));

    const met = previewResults?.achievedCount ?? 0;
    const subs = cd.SubClients ?? [];
    return {
        title: "Computation Report",
        meta: [
            `${cd.ContractReference || "Contract"}${cd.ContractName ? ` · ${cd.ContractName}` : ""}`,
            cd.ClientID?.label,
            `From ${date(cd.StartDate)} To ${date(cd.EndDate)}`,
            currency,
        ].filter(Boolean).join(" · "),
        fileName: `${cd.ContractReference || "Contract"} - Computation`,
        currency,
        general: [
            ["Reference", cd.ContractReference || "-"],
            ["Contract", cd.ContractName || "-"],
            ["Plan", resolved?.plan?.planName || "-"],
            ["Master supplier", cd.ClientID ? `${cd.ClientID.code ?? cd.ClientID.value} - ${cd.ClientID.label ?? ""}` : "-"],
            ["Associated suppliers", String(subs.length)],
            ["Period", `${date(cd.StartDate)} to ${date(cd.EndDate)}`],
            ["Currency", currency],
            ["Last generation to accounting", stamp(lastAccountingGenerationDate)],
            ["Purchases fetched", stamp(fetchedAt)],
            ["Locked", locked ? "Yes" : "No"],
        ],
        totals: [
            ["Targets met", `${met} of ${results.length}`],
            ["Rebate owed", m(totals.rebateOwed)],
            ["Fees owed", m(totals.feesOwed)],
            ["Total owed (rebate + fees)", m(totals.grandOwed)],
        ],
        fees: feeRows,
        targets: targetDocs,
        settlements,
    };
}

const FEE_COLUMNS = [
    { header: "Fee", key: "name" }, { header: "Settlement", key: "settlement" }, { header: "Amount", key: "amount", num: true },
    { header: "Settled", key: "settled", num: true }, { header: "Owed", key: "owed", num: true },
];
const TIER_COLUMNS = [
    { header: "Tier", key: "tier" }, { header: "Above", key: "above", num: true }, { header: "Rebate", key: "rebate" }, { header: "Reached", key: "reached" },
];
const conditionColumns = (g, many) => [
    { header: many ? `Block ${g.set} (${g.passed ? "pass" : "fail"})` : `Conditions (${g.passed ? "pass" : "fail"})`, key: "metric" },
    { header: "Required", key: "required", num: true }, { header: "Actual", key: "actual", num: true }, { header: "Result", key: "met" },
];
const SETTLEMENT_COLUMNS = [
    { header: "Processed", key: "processed" }, { header: "Item", key: "item" }, { header: "Covers", key: "covers" },
    { header: "Amount", key: "amount", num: true },
];
const ALWAYS = "No conditions: the rebate applies to all purchases in the period.";

/* ---------- Excel ---------- */

export async function exportComputationDocumentToExcel(params) {
    const doc = describeComputation(params);
    const { wb, cursor } = await startSheet({
        title: doc.title,
        subtitle: doc.meta,
        sheetName: "Computation",
        columns: [{ width: 22 }, { width: 22 }, { width: 20 }, { width: 20 }, { width: 22 }, { width: 22 }, { width: 18 }, { width: 18 }],
    });

    cursor.section("Contract");
    cursor.fields(doc.general);
    cursor.gap();
    cursor.section("Totals");
    cursor.fields(doc.totals);
    cursor.gap();

    cursor.section(`Fees (${doc.fees.length})`);
    cursor.table(FEE_COLUMNS.map((c, i) => ({ ...c, span: i === 0 ? 2 : 1 })), doc.fees, { emptyText: "No fees on this contract." });
    cursor.gap();

    cursor.section(`Targets (${doc.targets.length})`);
    doc.targets.forEach((t) => {
        cursor.gap();
        cursor.section(`Target ${t.n} · ${t.name}  ·  ${t.status}  ·  ${t.rebate}`, { tone: "soft" });
        cursor.fields(t.fields);
        if (t.range) cursor.table(TIER_COLUMNS.map((c, i) => ({ ...c, span: i === 1 ? 2 : 1 })), t.tiers, { emptyText: "No tiers defined." });
        else if (t.groups.length) {
            t.groups.forEach((g, gi) => {
                if (gi > 0) cursor.note("OR", { italic: false, bold: true });
                cursor.table(conditionColumns(g, t.groups.length > 1).map((c, i) => ({ ...c, span: i === 0 ? 2 : 1 })), g.rows);
            });
        } else cursor.note(ALWAYS);
    });

    cursor.gap();
    cursor.section(`Settlements (${doc.settlements.length})`);
    cursor.table(SETTLEMENT_COLUMNS.map((c, i) => ({ ...c, span: i === 1 || i === 2 ? 2 : 1 })), doc.settlements, { emptyText: "No settlements yet." });

    await saveWorkbook(wb, `${doc.fileName} ${moment().format("YYYY-MM-DD")}`);
}

/* ---------- Print ---------- */

/** Returns false when the browser blocked the print window. */
export function printComputationDocument(params, companyName = "") {
    const doc = describeComputation(params);
    const targets = doc.targets.map((t) => {
        let rule;
        if (t.range) rule = gridTable(TIER_COLUMNS, t.tiers, { emptyText: "No tiers defined." });
        else if (t.groups.length) {
            rule = t.groups.map((g, gi) => `${gi > 0 ? '<div class="or">OR</div>' : ""}${gridTable(conditionColumns(g, t.groups.length > 1), g.rows)}`).join("");
        } else rule = `<p class="note">${esc(ALWAYS)}</p>`;
        return `<div class="target"><h3>Target ${t.n} · ${esc(t.name)}<small>${esc(t.status)} · ${esc(t.rebate)}</small></h3>${fieldsTable(t.fields)}${rule}</div>`;
    }).join("");

    const body = `
<div class="block"><h2>Contract</h2>${fieldsTable(doc.general)}</div>
<div class="block"><h2>Totals</h2>${fieldsTable(doc.totals)}</div>
<div class="block"><h2>Fees (${doc.fees.length})</h2>${gridTable(FEE_COLUMNS, doc.fees, { emptyText: "No fees on this contract." })}</div>
<h2>Targets (${doc.targets.length})</h2>
${targets || '<p class="note">No targets on this contract.</p>'}
<div class="block"><h2>Settlements (${doc.settlements.length})</h2>${gridTable(SETTLEMENT_COLUMNS, doc.settlements, { emptyText: "No settlements yet." })}</div>`;

    return openPrintWindow({ title: doc.title, details: doc.meta, body, companyName });
}
