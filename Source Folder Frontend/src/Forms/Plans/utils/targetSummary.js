import { normalizeRebateValueType } from "../../../utils/planWorkspaceValidation";
import { resolveTierConditionType } from "./targetTierValidation";
import { PERCENT_DECIMALS, metricDecimals, rebateDecimals } from "../../../utils/numberRules";

export const METRICS = [
    { value: "S", label: "Purchase amount", short: "Purchases" },
    { value: "Q", label: "Purchase quantity", short: "Quantity" },
    { value: "G", label: "Growth", short: "Growth" },
];

export const OPERATORS = [
    { value: ">=", label: "≥", word: "at least" },
    { value: "<=", label: "≤", word: "at most" },
    { value: "=", label: "=", word: "exactly" },
];

const fmt = (v, decimals = 2) => {
    if (v === "" || v == null) return "…";
    const n = Number(v);
    return Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: decimals }) : String(v);
};

export function metricUnit(type, currency) {
    if (type === "S") return currency || "";
    if (type === "Q") return "Pcs";
    if (type === "G") return "%";
    return "";
}

export function formatMetricValue(type, value, currency) {
    const unit = metricUnit(type, currency);
    if (type === "G") return `${fmt(value, PERCENT_DECIMALS)}%`;
    return unit ? `${fmt(value, metricDecimals(type, currency))} ${unit}` : fmt(value);
}

export function formatReward(valueType, value, currency) {
    return normalizeRebateValueType(valueType) === "P"
        ? `${fmt(value, PERCENT_DECIMALS)}% of Purchases`
        : `${fmt(value, rebateDecimals("F", currency))} ${currency || ""}`.trim();
}

const metricLabel = (type) => METRICS.find((m) => m.value === type)?.label ?? "Metric";
const opLabel = (op) => OPERATORS.find((o) => o.value === op)?.label ?? op ?? "?";

export function describeCondition(c, currency) {
    if (!c?.conditionType) return null;
    return `${metricLabel(c.conditionType)} ${opLabel(c.operator)} ${formatMetricValue(c.conditionType, c.value, currency)}`;
}

/** One line for the target list, e.g. "2.5% of Purchases · when Purchase amount ≥ 10,000 USD". */
export function summarizeTarget(target, currency) {
    if ((target.targetType || "formula") === "range") {
        const type = resolveTierConditionType(target.tierConditionType, target.tiers);
        const count = (target.tiers ?? []).length;
        if (!type || !count) return "Tiers, none added yet";
        return `${count} ${count === 1 ? "tier" : "tiers"} on ${metricLabel(type).toLowerCase()}`;
    }
    const reward = target.rebateValue !== "" && target.rebateValue != null
        ? formatReward(target.rebateValueType, target.rebateValue, currency)
        : "No rebate set";
    const groups = (target.conditionGroups ?? []).filter((g) => (g.conditions ?? []).some((c) => c.conditionType));
    if (!groups.length) return `${reward} · always`;
    const first = describeCondition(groups[0].conditions.find((c) => c.conditionType), currency);
    const more = groups.reduce((n, g) => n + g.conditions.filter((c) => c.conditionType).length, 0) - 1;
    return `${reward} · when ${first}${more > 0 ? ` +${more}` : ""}`;
}

/**
 * Full sentence for the rule preview:
 * "Rebate of 2.5% of Purchases when (Purchase amount ≥ 10,000 USD and Purchase quantity ≥ 100 Pcs) or Growth ≥ 5%."
 */
export function describeFormulaRule(target, currency) {
    const reward = target.rebateValue !== "" && target.rebateValue != null
        ? formatReward(target.rebateValueType, target.rebateValue, currency)
        : "…";
    const groups = (target.conditionGroups ?? [])
        .map((g) => (g.conditions ?? []).map((c) => describeCondition(c, currency)).filter(Boolean))
        .filter((parts) => parts.length);
    if (!groups.length) return `Rebate of ${reward} on all purchases in the target period.`;
    const text = groups
        .map((parts) => (parts.length > 1 && groups.length > 1 ? `(${parts.join(" and ")})` : parts.join(" and ")))
        .join(" or ");
    return `Rebate of ${reward} when ${text}.`;
}
