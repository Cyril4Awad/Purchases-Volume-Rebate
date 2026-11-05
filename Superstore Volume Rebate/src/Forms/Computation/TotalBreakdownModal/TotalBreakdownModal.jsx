import { useEffect, useMemo, useState } from "react";
import moment from "moment";

import { FileSpreadsheet } from "lucide-react";
import { ModalComp } from "../../../ReusableComponents";
import "../../../ui/ui.css";
import "../../Plans/styles/contractEditor.css";
import { buildMonthEndWindows } from "../utils/salesBreakdownUtils";
import { allocateTargetMonthContributions } from "../utils/totalBreakdownUtils";
import { groupFeesByCalendarMonth } from "../../../utils/feePeriodSchedule";
import { resolveTargetSalesKey } from "../../../utils/computationEngine";
import {
    monthKeyOverlapsPaidPeriod,
    paymentsWithPeriodForFee,
    paymentsWithPeriodForTarget,
} from "../../../utils/settlementPaymentLogic";
import BreakdownMonthMasterDetail, { BreakdownSummary } from "../utils/BreakdownMonthMasterDetail";
import { fmtRebateAmount } from "../utils/computationDisplayUtils";
import { exportTotalBreakdownToExcel } from "../../../utils/exportComputationToExcel";

import "../SalesBreakdownModal/SalesBreakdownModal.css";

function derivePaidStatus(contributors = []) {
    if (!contributors.length) return "none";
    const paidCount = contributors.filter((c) => c.isPaid).length;
    if (paidCount === 0) return "none";
    if (paidCount === contributors.length) return "full";
    return "partial";
}

function sumContributorAmounts(contributors, paidOnly) {
    return contributors
        .filter((c) => !!c.isPaid === paidOnly)
        .reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
}

export default function TotalBreakdownModal({
    open,
    onClose,
    targets = [],
    targetResults = [],
    fees = [],
    contractStart,
    contractEnd,
    settlementTypesMap,
    fetchSalesForDraftWindows,
    allClientIds = [],
    contractCurrency,
    asOf,
    contractReference = "",
    payments = [],
}) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [exporting, setExporting] = useState(false);
    const [exportError, setExportError] = useState(null);
    const [targetContributions, setTargetContributions] = useState([]);
    const currency = contractCurrency ?? "USD";
    const asOfDateKey = asOf ? moment(asOf).format("YYYY-MM-DD") : moment().format("YYYY-MM-DD");

    const monthWindows = useMemo(
        () => buildMonthEndWindows(contractStart, contractEnd, contractEnd),
        [contractStart, contractEnd]
    );

    const feeMonths = useMemo(
        () => groupFeesByCalendarMonth(fees, contractStart, contractEnd, settlementTypesMap),
        [fees, contractStart, contractEnd, settlementTypesMap]
    );

    useEffect(() => {
        if (!open) {
            setTargetContributions([]);
            setError(null);
            setLoading(false);
            setExporting(false);
            setExportError(null);
            return undefined;
        }
        if (!fetchSalesForDraftWindows || !allClientIds?.length) {
            setTargetContributions([]);
            return undefined;
        }

        let cancelled = false;
        setLoading(true);
        setError(null);

        const jobs = (targets || []).map((target) => {
            const resultKey = resolveTargetSalesKey(target);
            const result = (targetResults || []).find(
                (r) => String(r.targetId ?? "") === resultKey
            );
            const from = target?.fromDate ?? target?.FromDate;
            const to = target?.toDate ?? target?.ToDate;
            const windows = buildMonthEndWindows(from, to, asOfDateKey);
            if (!windows.length) return Promise.resolve([]);
            return fetchSalesForDraftWindows(target, allClientIds, windows).then((mapped) =>
                allocateTargetMonthContributions({
                    target,
                    evaluationResult: result,
                    windows,
                    salesByWindowKey: mapped ?? {},
                    currency,
                })
            );
        });

        Promise.all(jobs)
            .then((groups) => {
                if (!cancelled) setTargetContributions(groups.flat());
            })
            .catch((err) => {
                if (!cancelled) setError(err?.message || "Failed to load monthly totals.");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [
        open,
        targets,
        targetResults,
        allClientIds,
        fetchSalesForDraftWindows,
        asOfDateKey,
        currency,
    ]);

    const months = useMemo(() => {
        const feeByKey = {};
        feeMonths.forEach((m) => {
            feeByKey[m.key] = m;
        });
        return monthWindows.map((window) => {
            const targetsForMonth = targetContributions
                .filter((c) => c.monthKey === window.key)
                .map((c) => ({
                    ...c,
                    isPaid: monthKeyOverlapsPaidPeriod(
                        window.key,
                        paymentsWithPeriodForTarget(payments, c.targetId)
                    ),
                }));
            const feesForMonth = (feeByKey[window.key]?.contributors ?? []).map((c) => ({
                kind: "fee",
                id: c.id,
                name: c.name,
                rate: null,
                cadence: c.cadence,
                amount: c.amount,
                isPaid: monthKeyOverlapsPaidPeriod(
                    window.key,
                    paymentsWithPeriodForFee(payments, c.id)
                ),
            }));
            const contributors = [...targetsForMonth, ...feesForMonth];
            const total = contributors.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
            const paidStatus = derivePaidStatus(contributors);

            return {
                key: window.key,
                label: window.label,
                total,
                contributors,
                paidStatus,
                paidAmount: sumContributorAmounts(contributors, true),
                outstandingAmount: sumContributorAmounts(contributors, false),
            };
        });
    }, [monthWindows, targetContributions, feeMonths, payments]);

    const handleExportExcel = async () => {
        setExporting(true);
        setExportError(null);
        try {
            await exportTotalBreakdownToExcel({
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
    const sumKind = (kind) => months.reduce((sum, m) => sum + (m.contributors ?? [])
        .filter((c) => c.kind === kind).reduce((a, c) => a + (Number(c.amount) || 0), 0), 0);
    const rebateTotal = sumKind("target");
    const feesTotal = sumKind("fee");
    const settledTotal = (payments ?? []).reduce((sum, p) => sum + (Number(p.amountProcessed) || 0), 0);
    const dueToDate = months.filter((m) => m.key <= nowKey).reduce((sum, m) => sum + (Number(m.total) || 0), 0);

    const modalBody = (
        <div className="bmd-modal-body">
            {exportError && <div className="text-danger small mb-2">{exportError}</div>}
            {loading && (
                <div className="d-flex align-items-center gap-2 text-muted py-3">
                    <div className="spinner-border spinner-border-sm text-secondary" role="status" />
                    <span>Loading monthly totals...</span>
                </div>
            )}
            {error && <div className="text-danger py-2">{error}</div>}
            {!loading && !error && (
                <>
                    <BreakdownSummary
                        currency={currency}
                        items={[
                            { label: "Total", value: rebateTotal + feesTotal, tone: "primary" },
                            { label: "Rebate", value: rebateTotal, tone: "success" },
                            { label: "Fees", value: feesTotal, tone: "warning" },
                            { label: "Due to date", value: dueToDate },
                        ]}
                    />
                    <BreakdownMonthMasterDetail
                        months={months}
                        currency={currency}
                        tone="total"
                        emptyMessage="No months in this contract range."
                        detailTotalCaption="Total due"
                    />
                    {settledTotal > 0 && (
                        <div className="text-muted small mt-2">Already settled on this contract: {fmtRebateAmount(settledTotal, currency)} {currency}</div>
                    )}
                </>
            )}
            <div className="picker-modal-footer">
                <button type="button" className="ds-btn ds-btn-secondary me-auto" disabled={exporting || loading} onClick={handleExportExcel}>
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
            modalTitle="Total breakdown"
            modalBody={modalBody}
            onClose={onClose}
            hideFooterButtons
            showCloseIcon
            size="xl"
            className="picker-modal bmd-modal"
        />
    );
}
