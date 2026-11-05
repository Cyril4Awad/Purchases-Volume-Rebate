import moment from "moment";
import { currencyDecimals } from "../../../utils/numberRules";
import { normalizeRebateValueType } from "../../../utils/planWorkspaceValidation";
import { saveWorkbook, startSheet } from "../../../utils/excelBrand";
import { esc, fieldsTable, gridTable, openPrintWindow } from "../../../utils/printBrand";
import { describeCondition, formatMetricValue, formatReward, METRICS } from "./targetSummary";

/*
 * The contract as a document, shared by the Excel export and the printed report so both
 * show the same thing: general details, suppliers, terms, fees (with how they are paid) and
 * every target with its period, settings, item scope and rule (conditions or tiers).
 */

/* ---------- fee installments (local copy of the reference helper; the computation keeps its own) ---------- */

const PERIOD_LENGTH_MIN = 1;

/*
 * Contract length in whole months, counted from its start date (15/02 -> 15/02 next year is
 * 12). The end date is exclusive, like the sales ranges; a leftover of a few days (a 31/12 end
 * read as ending on the 30th) is ignored, a longer one counts as one more month.
 */
function contractMonthCount(contractStart, contractEnd) {
    const start = moment(contractStart).startOf("day");
    const end = moment(contractEnd).startOf("day");
    if (!start.isValid() || !end.isValid() || !end.isAfter(start)) return 0;
    let whole = 0;
    while (start.clone().add(whole + 1, "months").isSameOrBefore(end)) whole += 1;
    const from = start.clone().add(whole, "months");
    const rest = end.diff(from, "days") / from.clone().add(1, "month").diff(from, "days");
    return rest > 0.1 || whole === 0 ? whole + 1 : whole;
}

/*
 * A fee's amount is the total for the whole contract, split evenly across the settlement
 * periods that fit in it completely; each share is paid at the end of its period. Months
 * left over after the last full period don't get a payment of their own:
 *   12,000 monthly on 12 months -> 1,000 x 12;  on 6 months -> 2,000 x 6
 *   12,000 quarterly on 10 months -> 4,000 x 3 (month 10 adds nothing)
 *   12,000 quarterly on 5 months  -> 12,000 once, at the end of the first quarter
 * Periods run from the contract start (start + k x period months). Each installment is
 * listed under the month of its period's last day. Shares are rounded to the currency's
 * decimals when a currency is given; the last share takes the remainder.
 *   [{ index, months, closeKey: "YYYY-MM", dueDate: "YYYY-MM-DD", amount }]
 * Mirrored by SettlementPaymentCalculator.FeeInstallments in the backend.
 */
function feeInstallments(feeAmount, periodLength, contractStart, contractEnd, currency = null) {
    const amount = Number(feeAmount ?? 0);
    const period = Number(periodLength);
    if (!(amount > 0) || !Number.isFinite(period) || period < PERIOD_LENGTH_MIN || !contractStart || !contractEnd) return [];
    const totalMonths = contractMonthCount(contractStart, contractEnd);
    if (!totalMonths) return [];
    const start = moment(contractStart).startOf("day");
    const end = moment(contractEnd).startOf("day");
    const count = Math.max(1, Math.floor(totalMonths / period));
    const months = Math.min(period, totalMonths);
    const out = [];
    let allocated = 0;
    const f = currency ? 10 ** currencyDecimals(currency) : null;
    const even = f ? Math.round((amount / count) * f) / f : amount / count;
    for (let index = 1; index <= count; index += 1) {
        const share = index === count ? amount - allocated : even;
        allocated += share;
        const due = moment.min(start.clone().add(index * months, "months"), end); // the day after the period
        const lastDay = due.clone().subtract(1, "day");
        out.push({ index, months, closeKey: lastDay.format("YYYY-MM"), dueDate: due.format("YYYY-MM-DD"), amount: share });
    }
    return out;
}

const date = (d) => (d ? moment(d).format("DD/MM/YYYY") : "-");
const label = (v) => (v && typeof v === "object" ? v.label ?? "" : v ?? "");
const money = (v, currency) => (v === "" || v == null ? "-" : `${Number(v).toLocaleString("en-US", {
    minimumFractionDigits: currencyDecimals(currency), maximumFractionDigits: currencyDecimals(currency),
})} ${currency}`.trim());
const metricName = (type) => METRICS.find((m) => m.value === type)?.label ?? "Metric";
const OP = { ">=": "≥", "<=": "≤", "=": "=", ">": ">", "<": "<" };

const stripHtml = (html) => String(html ?? "")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|li|div)>/gi, "\n").replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n").trim();

const supplierLine = (opt, role) => ({ code: opt?.code ?? String(opt?.value ?? ""), name: opt?.label ?? "", role });

function installmentsText(fee, settTypes, cd, currency) {
    const period = settTypes.find((o) => o.value === fee.settlementTypeId?.value)?.periodLength;
    const parts = feeInstallments(fee.amount, period, cd.StartDate, cd.EndDate, currency);
    if (!parts.length) return "-";
    const runs = [];
    parts.forEach((p) => {
        const last = runs[runs.length - 1];
        if (last && Math.abs(last.amount - p.amount) < 0.005) last.count += 1;
        else runs.push({ amount: p.amount, count: 1 });
    });
    return runs.map((r) => (r.count > 1 ? `${r.count} × ${money(r.amount, currency)}` : money(r.amount, currency))).join(" + ");
}

export function describeContract(draft, lookups) {
    const cd = draft.contractDraft;
    const currency = cd.contractCurrency?.value ?? "";
    const settTypes = lookups?.settTypes ?? [];
    const end = cd.EndDate ? `${date(cd.EndDate)} (purchases up to ${moment(cd.EndDate).subtract(1, "day").format("DD/MM/YYYY")})` : "-";

    const targets = draft.targets.map((t, i) => {
        const range = (t.targetType || "formula") === "range";
        const refs = t.references ?? [];
        const groups = (t.conditionGroups ?? []).filter((g) => (g.conditions ?? []).some((c) => c.conditionType));
        const tiers = (t.tiers ?? [])
            .filter((x) => x.value !== "" && x.value != null)
            .sort((a, b) => Number(a.value) - Number(b.value))
            .map((x, n) => ({
                tier: `Tier ${n + 1}`,
                threshold: `> ${formatMetricValue(t.tierConditionType, x.value, currency)}`,
                reward: formatReward(x.rebateValueType, x.rebateValue, currency),
            }));
        const stock = refs.filter((r) => r.referenceType === "StockItem").length;
        const groupsCount = refs.length - stock;
        return {
            n: i + 1,
            name: t.targetName || `Target ${i + 1}`,
            fields: [
                ["Period", `${date(t.fromDate)} to ${date(t.toDate)}`],
                ["Rule", range ? `Tiers on ${metricName(t.tierConditionType).toLowerCase()}` : "Conditions"],
                ["Computation", label(t.computationTypeId) || "-"],
                ["Settlement", label(t.settlementTypeId) || "-"],
                ["Rebate", range ? "By tier (below)" : (t.rebateValue !== "" && t.rebateValue != null ? formatReward(t.rebateValueType, t.rebateValue, currency) : "-")],
                ["Item scope", refs.length ? [stock && `${stock} stock ${stock === 1 ? "item" : "items"}`, groupsCount && `${groupsCount} ${groupsCount === 1 ? "category" : "categories"}`].filter(Boolean).join(", ") : "All items"],
            ],
            range,
            tiers,
            conditions: groups.map((g, gi) => ({
                set: gi + 1,
                rows: g.conditions.filter((c) => c.conditionType).map((c) => ({
                    metric: metricName(c.conditionType),
                    operator: OP[c.operator] ?? c.operator ?? "",
                    value: formatMetricValue(c.conditionType, c.value, currency),
                    text: describeCondition(c, currency),
                })),
            })),
            fixed: !range && normalizeRebateValueType(t.rebateValueType) === "F",
            references: refs.map((r) => ({
                type: r.referenceType === "StockItem" ? "Stock item" : "Category",
                code: r.referenceType === "StockItem" ? r.stkRef ?? "" : r.itCode ?? "",
                description: r.referenceType === "StockItem" ? r.stkDesc ?? r.label ?? "" : r.itDesc ?? r.label ?? "",
            })),
        };
    });

    return {
        title: "Contract Report",
        meta: [`${cd.ContractReference || "Contract"}${cd.ContractName ? ` · ${cd.ContractName}` : ""}`, cd.ClientID?.label,
            `From ${date(cd.StartDate)} To ${date(cd.EndDate)}`, currency].filter(Boolean).join(" · "),
        fileName: `${cd.ContractReference || "Contract"}${cd.ContractName ? ` - ${cd.ContractName}` : ""}`,
        currency,
        general: [
            ["Reference", cd.ContractReference],
            ["Contract name", cd.ContractName],
            ["Volume rebate type", label(draft.plan?.typeId) || "-"],
            ["Currency", currency || "-"],
            ["Start date", date(cd.StartDate)],
            ["End date", end],
            ["Status", cd.Active ? "Active" : "Inactive"],
            ["Document", cd.Document?.name ?? "None"],
        ],
        clients: [supplierLine(cd.ClientID, "Main supplier"), ...cd.SubClients.map((s) => supplierLine(s.ClientID, s.ClientID?.clientType || "Associated"))]
            .filter((c) => c.code || c.name),
        terms: stripHtml(cd.Terms),
        remarks: cd.Remarks?.trim() ?? "",
        fees: draft.fees.map((f) => ({
            name: f.typeLabel || "Fee",
            amount: money(f.amount, currency),
            settlement: label(f.settlementTypeId) || "-",
            paid: installmentsText(f, settTypes, cd, currency),
        })),
        targets,
    };
}

const fileName = (doc) => doc.fileName;

/* ---------- Excel ---------- */

export async function exportContractToExcel(draft, lookups) {
    const doc = describeContract(draft, lookups);
    const { wb, cursor } = await startSheet({
        title: doc.title,
        subtitle: doc.meta,
        sheetName: "Contract",
        columns: [{ width: 20 }, { width: 22 }, { width: 18 }, { width: 18 }, { width: 20 }, { width: 22 }, { width: 18 }, { width: 18 }],
    });

    cursor.section("General");
    cursor.fields(doc.general);
    if (doc.remarks) cursor.fields([["Remarks", doc.remarks]], { perRow: 1 });
    cursor.gap();

    cursor.section(`Suppliers (${doc.clients.length})`);
    cursor.table(
        [{ header: "Code", key: "code", span: 2 }, { header: "Supplier", key: "name", span: 4 }, { header: "Role", key: "role" }],
        doc.clients
    );
    cursor.gap();

    if (doc.terms) {
        cursor.section("Terms");
        cursor.note(doc.terms, { italic: false, color: "101828" });
        cursor.gap();
    }

    cursor.section(`Fees (${doc.fees.length})`);
    cursor.table(
        [{ header: "Fee", key: "name", span: 2 }, { header: "Amount", key: "amount", num: true }, { header: "Settlement", key: "settlement" }, { header: "Paid as", key: "paid" }],
        doc.fees,
        { emptyText: "No fees on this contract." }
    );
    cursor.gap();

    cursor.section(`Targets (${doc.targets.length})`);
    if (!doc.targets.length) cursor.note("No targets on this contract.");
    doc.targets.forEach((t) => {
        cursor.gap();
        cursor.section(`Target ${t.n} · ${t.name}`, { tone: "soft" });
        cursor.fields(t.fields);
        if (t.range) {
            cursor.table([{ header: "Tier", key: "tier" }, { header: "Above", key: "threshold", span: 3 }, { header: "Rebate", key: "reward" }], t.tiers, { emptyText: "No tiers defined." });
        } else if (t.conditions.length) {
            t.conditions.forEach((g, gi) => {
                if (gi > 0) cursor.note("OR", { italic: false, bold: true });
                cursor.table(
                    [{ header: t.conditions.length > 1 ? `Set ${g.set}: all of` : "Conditions: all of", key: "metric", span: 3 }, { header: "Operator", key: "operator" }, { header: "Value", key: "value", num: true }],
                    g.rows
                );
            });
        } else {
            cursor.note("No conditions: the rebate applies to all purchases in the period.");
        }
    });

    // Item scopes in full on their own sheet, so the contract sheet stays readable.
    const scoped = doc.targets.filter((t) => t.references.length);
    if (scoped.length) {
        const ws = wb.addWorksheet("Target items", { views: [{ showGridLines: false }] });
        ws.columns = [{ width: 28 }, { width: 16 }, { width: 18 }, { width: 60 }];
        const header = ws.addRow(["Target", "Type", "Code", "Description"]);
        header.eachCell((c) => {
            c.font = { bold: true, color: { argb: "FFFFFFFF" } };
            c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF155DFC" } };
        });
        scoped.forEach((t) => t.references.forEach((r) => ws.addRow([t.name, r.type, r.code, r.description])));
        ws.autoFilter = { from: "A1", to: "D1" };
        ws.views = [{ state: "frozen", ySplit: 1, showGridLines: true }];
    }

    await saveWorkbook(wb, fileName(doc));
}

/* ---------- Print ---------- */

export function printContractReport(draft, lookups, companyName = "") {
    const doc = describeContract(draft, lookups);
    const targets = doc.targets.map((t) => {
        let rule;
        if (t.range) {
            rule = gridTable([{ header: "Tier", key: "tier" }, { header: "Above", key: "threshold", num: true }, { header: "Rebate", key: "reward" }], t.tiers, { emptyText: "No tiers defined." });
        } else if (t.conditions.length) {
            rule = t.conditions.map((g, gi) => `${gi > 0 ? '<div class="or">OR</div>' : ""}${gridTable(
                [{ header: t.conditions.length > 1 ? `Set ${g.set}: all of` : "Conditions: all of", key: "metric" }, { header: "Operator", key: "operator" }, { header: "Value", key: "value", num: true }],
                g.rows
            )}`).join("");
        } else {
            rule = '<p class="note">No conditions: the rebate applies to all purchases in the period.</p>';
        }
        return `<div class="target"><h3>Target ${t.n} · ${esc(t.name)}</h3>${fieldsTable(t.fields)}${rule}</div>`;
    }).join("");

    const body = `
<div class="block"><h2>General</h2>${fieldsTable(doc.general)}${doc.remarks ? fieldsTable([["Remarks", doc.remarks]]) : ""}</div>
<div class="block"><h2>Suppliers (${doc.clients.length})</h2>${gridTable([{ header: "Code", key: "code" }, { header: "Supplier", key: "name" }, { header: "Role", key: "role" }], doc.clients)}</div>
${doc.terms ? `<div class="block"><h2>Terms</h2><p class="rule">${esc(doc.terms).replace(/\n/g, "<br>")}</p></div>` : ""}
<div class="block"><h2>Fees (${doc.fees.length})</h2>${gridTable([{ header: "Fee", key: "name" }, { header: "Amount", key: "amount", num: true }, { header: "Settlement", key: "settlement" }, { header: "Paid as", key: "paid" }], doc.fees, { emptyText: "No fees on this contract." })}</div>
<h2>Targets (${doc.targets.length})</h2>
${targets || '<p class="note">No targets on this contract.</p>'}`;

    return openPrintWindow({ title: doc.title, details: doc.meta, body, companyName });
}
