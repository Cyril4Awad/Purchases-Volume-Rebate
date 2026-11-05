import { createElement } from "react";
import moment from "moment";
import { Eye, FileSpreadsheet, Lock, Pencil, Printer, Trash2 } from "lucide-react";
import { getContractLabelForPlanRow } from "./planWorkspaceMappers";
import { mobileActionRow, mobileLabeledRow } from "./mobileTableCells";

const getLabel = (opt) => opt?.label || "";


export function buildPlanTableRow(draft, contractRecords = [], { workspaceItem } = {}) {
    const { draft: hydrated, label } = getContractLabelForPlanRow(draft, contractRecords);
    const contract = hydrated.contractDraft;
    const startDate = contract?.StartDate ?? null;
    const endDate = contract?.EndDate ?? null;

    return {
        recordId: hydrated.recordId,
        planName: hydrated.plan?.planName ?? "",
        contractLabel: label || "-",
        typeLabel: getLabel(hydrated.plan?.typeId),
        startDate: startDate ? moment(startDate).format("DD-MM-YYYY") : "-",
        endDate: endDate ? moment(endDate).format("DD-MM-YYYY") : "-",
        activeLabel: contract?.Active ? "Yes" : "No",
        _draft: hydrated,
        ...(workspaceItem != null ? { _workspaceItem: workspaceItem } : {}),
    };
}

export function getPlanWorkspaceTableColumns({
    includeActions = true,
    openEdit,
    handleDelete,
    isContractLocked,
    onExcel,
    onReport,
} = {}) {
    const columns = [
        {
            Header: "Contract",
            accessor: "contractLabel",
            Cell: (row) => (
                <div style={{ marginLeft: "10px" }}>
                    {mobileLabeledRow("Contract", row.value)}
                </div>
            ),
            //Cell: (row) => mobileLabeledRow("Contract", row.value),
        },
        {
            Header: "Plan Name",
            accessor: "planName",
            Cell: (row) => mobileLabeledRow("Plan Name", row.value),
        },
        {
            Header: "VR Type",
            accessor: "typeLabel",
            Cell: (row) => mobileLabeledRow("VR Type", row.value),
        },
        {
            Header: "Start Date",
            accessor: "startDate",
            style: { textAlign: "center" },
            width: 130,
            Cell: (row) => mobileLabeledRow("Start Date", row.value),
        },
        {
            Header: "End Date",
            accessor: "endDate",
            style: { textAlign: "center" },
            width: 130,
            Cell: (row) => mobileLabeledRow("End Date", row.value),
        },
        {
            Header: "Status",
            accessor: "activeLabel",
            style: { textAlign: "center" },
            width: 150,
            // (reference) status pills: Active / Inactive, plus Locked when computations exist
            Cell: (row) => {
                const active = row.value === "Yes";
                const locked = isContractLocked?.(row.original) === true;
                return mobileLabeledRow("Active", createElement(
                    "div",
                    { className: "d-inline-flex align-items-center justify-content-center gap-1 flex-wrap" },
                    createElement("span", { className: `ds-badge ${active ? "is-active" : "is-inactive"}` }, active ? "Active" : "Inactive"),
                    locked && createElement(
                        "span",
                        { className: "ds-badge is-locked", title: "Has saved computations, read-only" },
                        createElement(Lock, { size: 11 }),
                        "Locked"
                    )
                ));
            },
        },
    ];

    if (includeActions) {
        columns.push({
            Header: "Actions",
            accessor: "recordId",
            sortable: false,
            width: (onExcel ? 38 : 0) + (onReport ? 38 : 0) + 110,
            Cell: (row) => {
                const locked = isContractLocked?.(row.original) === true;
                const iconBtn = (key, icon, label, onClick, extra = "") => createElement(
                    "button",
                    {
                        key,
                        type: "button",
                        className: `ds-btn ds-btn-icon plan-action-btn${extra}`,
                        onClick: onClick
                            ? (e) => { e.stopPropagation(); onClick(); }
                            : undefined,
                        disabled: !onClick,
                        "aria-label": label,
                        title: label,
                    },
                    createElement(icon, { size: 16 })
                );
                return mobileActionRow(
                    createElement(
                        "div",
                        { className: "d-flex align-items-center justify-content-center gap-1 plan-actions" },
                        locked
                            ? iconBtn("view", Eye, "View (locked)", () => openEdit?.(row.original))
                            : iconBtn("edit", Pencil, "Edit", () => openEdit?.(row.original)),
                        onExcel && iconBtn("excel", FileSpreadsheet, "Export to Excel", () => onExcel(row.original)),
                        onReport && iconBtn("report", Printer, "Print report", () => onReport(row.original)),
                        iconBtn(
                            "delete",
                            Trash2,
                            locked ? "Locked: can't be deleted" : "Delete",
                            locked ? undefined : () => handleDelete?.(row.original.recordId),
                            " plan-action-btn--danger"
                        )
                    )
                );
            },
        });
    }

    return columns;
}
