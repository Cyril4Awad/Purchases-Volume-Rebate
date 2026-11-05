import moment from "moment";
import exportTableToExcel from "./exportTableToExcel";
import { gridTable, openPrintWindow } from "./printBrand";

// The contracts list as a branded Excel sheet or a printed report (same pattern as the
// reference's exportContracts.js). Rows are the contracts table rows (buildPlanTableRow).

const date = (d) => (d ? moment(d).format("DD/MM/YYYY") : "");

const COLUMNS = [
    { Header: "Reference", accessor: "reference" },
    { Header: "Contract", accessor: "name" },
    { Header: "Plan", accessor: "plan" },
    { Header: "VR type", accessor: "type" },
    { Header: "Supplier code", accessor: "supplierCode" },
    { Header: "Master supplier", accessor: "supplier" },
    { Header: "Start", accessor: "start" },
    { Header: "End", accessor: "end" },
    { Header: "Currency", accessor: "currency" },
    { Header: "Targets", accessor: "targets" },
    { Header: "Fees", accessor: "fees" },
    { Header: "Associated suppliers", accessor: "associated" },
    { Header: "Status", accessor: "status" },
    { Header: "Locked", accessor: "locked" },
];
const NUMERIC = new Set(["targets", "fees", "associated"]);

const toRow = (row, isLocked) => {
    const d = row._draft ?? {};
    const cd = d.contractDraft ?? {};
    const currency = cd.contractCurrency?.value ?? cd.contractCurrency ?? "";
    return {
        reference: cd.ContractReference ?? "",
        name: cd.ContractName ?? "",
        plan: row.planName ?? "",
        type: row.typeLabel ?? "",
        supplierCode: cd.ClientID?.code ?? cd.ClientID?.value ?? "",
        supplier: cd.ClientID?.label ?? "",
        start: date(cd.StartDate),
        end: date(cd.EndDate),
        currency: String(currency).toUpperCase(),
        targets: String((d.targets ?? []).length),
        fees: String((d.fees ?? []).length),
        associated: String((cd.SubClients ?? []).length),
        status: cd.Active ? "Active" : "Inactive",
        locked: isLocked?.(row) ? "Yes" : "No",
    };
};

const countLabel = (n) => `${n} ${n === 1 ? "contract" : "contracts"}`;

export function exportContractsToExcel(rows, { isLocked } = {}) {
    return exportTableToExcel(COLUMNS, rows.map((r) => toRow(r, isLocked)), `Contracts ${moment().format("YYYY-MM-DD")}`, "Contracts", {
        title: "Contracts Report",
        subtitle: countLabel(rows.length),
    });
}

/** Returns false when the browser blocked the print window. */
export function printContractsReport(rows, { isLocked, companyName = "" } = {}) {
    const data = rows.map((r) => toRow(r, isLocked));
    return openPrintWindow({
        title: "Contracts Report",
        details: countLabel(data.length),
        companyName,
        body: gridTable(COLUMNS.map((c) => ({ header: c.Header, key: c.accessor, num: NUMERIC.has(c.accessor) })), data),
    });
}
