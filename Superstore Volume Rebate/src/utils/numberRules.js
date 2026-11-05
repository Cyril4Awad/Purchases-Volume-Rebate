// Decimal places by unit: percentages (rebate %, growth) up to 3, currency amounts (fees,
// rebates, sales) up to the company's amount decimals (ACC01_SysTable.SYS_DecPoint, loaded
// at sign-in by appSettings), none for LBP; quantities (Pcs) whole numbers.

export const PERCENT_DECIMALS = 3;

const WHOLE_CURRENCIES = new Set(["LBP"]);

let amountDecimals = 2;

/** Set once from the server settings (see appSettings.loadAppSettings). */
export function setAmountDecimals(value) {
    const n = Number(value);
    if (Number.isInteger(n) && n >= 0 && n <= 6) amountDecimals = n;
}

export const getAmountDecimals = () => amountDecimals;

const codeOf = (currency) =>
    String((currency && typeof currency === "object" ? currency.value : currency) ?? "").trim().toUpperCase();

export const currencyDecimals = (currency) => (WHOLE_CURRENCIES.has(codeOf(currency)) ? 0 : amountDecimals);

/** An amount rounded to its currency's decimals (LBP rebates are rounded to whole pounds). */
export function roundAmount(value, currency) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    const f = 10 ** currencyDecimals(currency);
    return Math.round((n + Math.sign(n) * Number.EPSILON) * f) / f;
}

/** Decimals for a condition/tier metric: S (amount in currency), Q (Pcs), G (growth %). */
export function metricDecimals(metric, currency) {
    if (metric === "G") return PERCENT_DECIMALS;
    if (metric === "Q") return 0;
    return currencyDecimals(currency);
}

/** Decimals for a rebate value: P (% of Sales) or F (fixed amount in currency). */
export const rebateDecimals = (rebateType, currency) => (rebateType === "P" ? PERCENT_DECIMALS : currencyDecimals(currency));

/** Trims a numeric string to the allowed decimals (used when the unit changes). */
export function trimDecimals(value, decimals) {
    if (value === "" || value == null) return value;
    const s = String(value);
    if (!s.includes(".")) return s;
    const [whole, frac] = s.split(".");
    return decimals > 0 ? `${whole}.${frac.slice(0, decimals)}`.replace(/\.$/, "") : whole;
}
