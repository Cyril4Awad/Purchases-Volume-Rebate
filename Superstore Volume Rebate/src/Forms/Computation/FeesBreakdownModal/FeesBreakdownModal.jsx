import { useMemo, useState } from "react";
import moment from "moment";

import { FileSpreadsheet } from "lucide-react";
import { ModalComp } from "../../../ReusableComponents";
import "../../../ui/ui.css";
import "../../Plans/styles/contractEditor.css";
import { groupFeesByCalendarMonth } from "../../../utils/feePeriodSchedule";
import { exportFeesBreakdownToExcel } from "../../../utils/exportComputationToExcel";
import {
    monthKeyOverlapsPaidPeriod,
    paymentsWithPeriodForFee,
} from "../../../utils/settlementPaymentLogic";
import BreakdownMonthMasterDetail, { BreakdownSummary } from "../utils/BreakdownMonthMasterDetail";

import "../SalesBreakdownModal/SalesBreakdownModal.css";

export default function FeesBreakdownModal({
    open,
    onClose,
    fees = [],
    contractStart,
    contractEnd,
    settlementTypesMap,
    totalFees = 0,
    contractCurrency,
    contractReference = "",
    payments = [],
}) {
    const currency = contractCurrency ?? "USD";
    const [exporting, setExporting] = useState(false);
    const [exportError, setExportError] = useState(null);

    const months = useMemo(() => {
        const base = groupFeesByCalendarMonth(fees, contractStart, contractEnd, settlementTypesMap);
        return base.map((m) => {
            const feeIds = [...new Set((m.contributors ?? []).map((c) => String(c.id ?? "")))];
            const periodPayments = feeIds.flatMap((feeId) =>
                paymentsWithPeriodForFee(payments, feeId)
            );
            return {
                ...m,
                isPaid: monthKeyOverlapsPaidPeriod(m.key, periodPayments),
            };
        });
    }, [fees, contractStart, contractEnd, settlementTypesMap, payments]);

    const handleExportExcel = async () => {
        setExporting(true);
        setExportError(null);
        try {
            await exportFeesBreakdownToExcel({
                contractReference,
                currency,
                months,
            });
        } catch (err) {
            setExportError(err?.message || "Export failed.");
        } finally {
            setExporting(false);
        }
    };

    const nowKey = moment().format("YYYY-MM");
    const totalOfMonths = months.reduce((sum, m) => sum + (Number(m.total) || 0), 0);
    const dueToDate = months.filter((m) => m.key <= nowKey).reduce((sum, m) => sum + (Number(m.total) || 0), 0);
    const settled = (payments ?? []).filter((p) => p.resultType === "F").reduce((sum, p) => sum + (Number(p.amountProcessed) || 0), 0);

    const modalBody = (
        <div className="bmd-modal-body">
            {exportError && <div className="text-danger small mb-2">{exportError}</div>}
            <BreakdownSummary
                currency={currency}
                items={[
                    { label: "Total fees", value: totalOfMonths || totalFees },
                    { label: "Due to date", value: dueToDate, tone: "warning" },
                    { label: "Settled", value: settled, tone: "success" },
                    { label: "Upcoming", value: Math.max(0, (totalOfMonths || totalFees) - dueToDate) },
                ]}
            />
            <BreakdownMonthMasterDetail
                months={months}
                currency={currency}
                tone="fees"
                emptyMessage="No fee periods in this contract range."
                detailTotalCaption="Fees due"
            />
            <div className="picker-modal-footer">
                <button type="button" className="ds-btn ds-btn-secondary me-auto" disabled={exporting} onClick={handleExportExcel}>
                    {exporting ? <span className="spinner-border spinner-border-sm" role="status" /> : <FileSpreadsheet size={16} />}
                    Export to Excel
                </button>
                <button type="button" className="ds-btn ds-btn-primary" onClick={onClose}>Close</button>
            </div>
        </div>
    );

    return (
        <ModalComp
            modal={!!open}
            modalTitle="Fees breakdown"
            modalBody={modalBody}
            onClose={onClose}
            hideFooterButtons
            showCloseIcon
            size="xl"
            className="picker-modal bmd-modal"
        />
    );
}
