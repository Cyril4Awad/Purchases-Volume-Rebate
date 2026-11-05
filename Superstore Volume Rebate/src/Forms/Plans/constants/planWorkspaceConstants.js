export const conditionTypeOptions = [
    { value: "S", label: "Purchase Amount" },
    { value: "Q", label: "Purchase Quantity" },
    { value: "G", label: "Growth" },
];

export const operatorOptions = [
    // { value: ">", label: "Greater Than" },
    { value: ">=", label: "Greater Than Or Equal" },
    // { value: "<", label: "Less Than" },
    { value: "<=", label: "Less Than Or Equal" },
    { value: "=", label: "Equal" },
];

export const referenceTypeOptions = [
    { value: "StockItem", label: "Stock Item" },
    { value: "ProductGroup", label: "Category" },
];

export const rebateValueTypeOptions = [
    { value: "F", label: "Fixed" },
    { value: "P", label: "Percentage" },
];

export const GROWTH_COMPARISON_CAPTION =
    "Growth is compared to the same date range in the previous year's purchases.";

export const REF_PICKER_PAGE_SIZE = 50;
export const PICKER_SEARCH_DEBOUNCE_MS = 400;
