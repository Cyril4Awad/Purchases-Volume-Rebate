import { createElement } from "react";
import { mobileActionRow, mobileDualCell, mobileLabeledRow } from "./mobileTableCells";

/** Shared supplier picker / sub-client table column definitions. */
export const CLIENT_TABLE_FIELD_COLUMNS = [
    { Header: "Code", accessor: "clientCode", label: "Code", width: 110, style: { textAlign: "center" } },
    { Header: "Supplier Name", accessor: "clientName", label: "Supplier Name", minWidth: 160 },
    { Header: "Representative", accessor: "ae", label: "Representative", width: 120 },
    { Header: "MOF #", accessor: "mof", label: "MOF #", width: 90 },
    { Header: "Address", accessor: "address", label: "Address", minWidth: 140 },
    { Header: "Phone 1", accessor: "phone1", label: "Phone 1", width: 110 },
    { Header: "Phone 2", accessor: "phone2", label: "Phone 2", width: 110 },
    { Header: "Currency", accessor: "categ", label: "Currency", width: 90, style: { textAlign: "center" } },
    { Header: "Payment", accessor: "clientType", label: "Payment", width: 110 },
];

export function mapClientFieldColumns(fields = CLIENT_TABLE_FIELD_COLUMNS) {
    return fields.map(({ label, ...col }) => ({
        ...col,
        Cell: (cell) => {
            const content = cell.value ?? "";
            if (col.style?.textAlign === "center") {
                return createElement(
                    "div",
                    { style: { textAlign: "center" } },
                    mobileDualCell(content, mobileLabeledRow(label, content))
                );
            }
            return mobileDualCell(content, mobileLabeledRow(label, content));
        },
    }));
}

export function buildPickerCheckboxColumn({ checked, onToggle, ariaLabel = "Select row", isLocked }) {
    return {
        Header: " ",
        accessor: "clRecId",
        width: 48,
        Cell: (cell) => {
            const locked = isLocked?.(cell.original);
            return mobileActionRow(
                createElement(
                    "div",
                    { className: `d-flex justify-content-center${locked ? " sub-client-picker-row--locked" : ""}` },
                    createElement("input", {
                        type: "checkbox",
                        className: "form-check-input m-0",
                        checked: checked(cell.original),
                        disabled: locked,
                        title: locked ? "Already added - remove from the table below" : undefined,
                        onChange: () => onToggle(cell.original),
                        "aria-label": ariaLabel,
                    })
                )
            );
        },
    };
}
