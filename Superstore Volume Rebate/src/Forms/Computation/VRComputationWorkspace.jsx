import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import moment from "moment";

import { AuthContext } from "../../ContextProvider/AuthContext";
import { getApiBase } from "../../globals";
import {
    Calculator, ChevronDown, Download, FileSearch, FileSpreadsheet, Lock, Printer, RefreshCw, Scale, Users,
} from "lucide-react";
import { AdvancedTable, ModalComp } from "../../ReusableComponents";
import { useToaster } from "../../ui/toast/Toaster";
import Pagination from "../../ui/Pagination";
import usePagedRows from "../../utils/usePagedRows";
import "../../ui/ui.css";
import "../Plans/styles/contractEditor.css";
import { triggerSessionExpired } from "../../utils/sessionExpired";
import { updateTokenFromResponse } from "../../utils/updateTokenFromResponse";
import "./VRComputationWorkspace.css";
import "../Plans/styles/VRPlansWorkspace.css";
import "../Plans/editor/PlanEditorModal/PlanEditorModal.css";

import { resolveTargetSalesKey } from "../../utils/computationEngine";
import { listContractPlans, resolveClientPlan } from "../../utils/computationPlanResolver";
import {
    buildSettlementTypesMap,
    buildTargetConfirmDetails,
    formatProcessAmountWithPeriods,
    getFeeEligibility,
    getPeriodLength,
    isConditionedTarget,
    paymentsForTarget,
    periodsPaidCountForTarget,
    SETTLEMENT_STATUS,
    sumSettlementTotals,
    tryResolveCoveredPeriodRange,
    tryResolveFinalCatchUpPeriodRange,
} from "../../utils/settlementPaymentLogic";


import { exportComputationDocumentToExcel, printComputationDocument } from "../../utils/computationDocument";
import { loadCompanyName } from "../../utils/appSettings";
import ComputationResultsPanel from "./ComputationResultsPanel/ComputationResultsPanel";
import {
    buildFeeBatchModalColumns,
    formatFeeAmount,
    formatMetricAmount,
    fmtQty,
    fmtRebateAmount,
} from "./utils/computationDisplayUtils";
import { useComputationPreview } from "./hooks/useComputationPreview";
import { useSettlementPayments } from "./hooks/useSettlementPayments";
import { useLastAccountingGenerationDate } from "./hooks/useLastAccountingGenerationDate";
import { mobileDualCell, mobileLabeledRow } from "../../utils/mobileTableCells";

const LoadingStep = ({ message }) => (
    <div className="d-flex align-items-center gap-2 text-muted small mt-2">
        <div className="spinner-border spinner-border-sm text-secondary" role="status" aria-hidden="true" />
        <span>{message}</span>
    </div>
);

/** Returns a blockedModal message when Location/CashReg session flags are null or invalid; otherwise null. */
function getLocationCashRegBlockMessage(locationValid, cashRegValid) {
    if (locationValid == null || cashRegValid == null) {
        return "Unable to verify location configuration.";
    }
    const parts = [];
    if (!locationValid) parts.push("Invalid location code.");
    if (!cashRegValid) parts.push("Invalid cash register code.");
    return parts.length > 0 ? parts.join("\n") : null;
}

export default function VRComputationWorkspace() {
    const { userData } = useContext(AuthContext);

    const authAxios = useMemo(() => {
        const instance = axios.create({
            headers: {
                Authorization: userData?.token ? `Bearer ${userData.token}` : "",
            },
        });
        instance.interceptors.request.use((config) => {
            const token = localStorage.getItem("token");
            if (token) config.headers.Authorization = `Bearer ${token}`;
            return config;
        });
        instance.interceptors.response.use(
            (response) => {
                updateTokenFromResponse(response);
                return response;
            },
            (error) => {
                if (error?.response?.status === 401) {
                    triggerSessionExpired();
                    return Promise.reject(error);
                }
                return Promise.reject(error);
            }
        );
        return instance;
    }, [userData]);

    const toast = useToaster();
    const showNotification = useCallback((type, title, message = "") => {
        const text = message ? `${String(title).trim()}: ${message}` : String(title).trim();
        (toast[type] ?? toast.info)(text);
    }, [toast]);

    const [selectedClient, setSelectedClient] = useState(null);
    // computation is opened by contract (one entry per plan of an active contract)
    const [contractPickerOpen, setContractPickerOpen] = useState(false);
    const [contractPlans, setContractPlans] = useState({ status: "idle", rows: [] });
    const [selectedPlanItem, setSelectedPlanItem] = useState(null);
    const [exportOpen, setExportOpen] = useState(false);
    const exportRef = useRef(null);
    const [totalBreakdownSignal, setTotalBreakdownSignal] = useState(0);

    const [resolved, setResolved] = useState(null);
    const [loadingResolve, setLoadingResolve] = useState(false);
    const [detailsModal, setDetailsModal] = useState({
        open: false, targetId: null, targetName: "", items: [], currencies: [], loading: false,
    });
    const [dailyRate, setDailyRate] = useState(null);
    const [blockedModal, setBlockedModal] = useState({ open: false, message: "" });
    const [confirmModal, setConfirmModal] = useState({
        open: false, target: null, targetResult: null, details: null,
        inlineError: null, inlineErrorType: null,
    });
    const [feeBatchModal, setFeeBatchModal] = useState({ open: false, rows: [], inlineError: null, inlineErrorType: null });
    const [contractLocked, setContractLocked] = useState(false);

    const {
        salesByTargetId,
        salesMetaByTargetId,
        previewResults,
        totalSalesAmountBase,
        loadingSales,
        runPreview,
        resetPreview,
        fetchSalesForDraftWindows,
    } = useComputationPreview(authAxios, { dailyRate });

    const {
        payments,
        loadingPayments,
        processing,
        loadPayments,
        resetPayments,
        processTarget,
        processFeesBatch,
    } = useSettlementPayments(authAxios);

    const { generationDate: lastAccountingGenerationDate } = useLastAccountingGenerationDate(authAxios);

    const resetWorkspace = useCallback(() => {
        setResolved(null);
        resetPreview();
        resetPayments();
        setBlockedModal({ open: false, message: "" });
        setConfirmModal({ open: false, target: null, targetResult: null, details: null, inlineError: null, inlineErrorType: null });
        setFeeBatchModal({ open: false, rows: [], inlineError: null, inlineErrorType: null });
    }, [resetPreview, resetPayments]);

    // contract picker: loaded when it opens
    useEffect(() => {
        if (!contractPickerOpen) return undefined;
        let cancelled = false;
        setContractPlans((prev) => ({ ...prev, status: "loading" }));
        listContractPlans(authAxios)
            .then((list) => {
                if (cancelled) return;
                const rows = list.map(({ contract, workspaceItem, draft }) => ({
                    key: `${contract.ContractID}-${draft.recordId ?? draft.plan?.planName ?? ""}`,
                    reference: contract.ContractReference ?? "",
                    name: contract.ContractName ?? "",
                    supplier: contract.ClientID
                        ? `${contract.ClientID.code ?? contract.ClientID.value} - ${contract.ClientID.label ?? ""}`
                        : "",
                    subCount: (contract.SubClients ?? []).length,
                    plan: draft.plan?.planName ?? "",
                    period: `${contract.StartDate ? moment(contract.StartDate).format("DD/MM/YYYY") : "-"} to ${contract.EndDate ? moment(contract.EndDate).format("DD/MM/YYYY") : "-"}`,
                    currency: String(contract.contractCurrency?.value ?? contract.contractCurrency ?? "").toUpperCase(),
                    contract,
                    workspaceItem,
                }));
                setContractPlans({ status: "ready", rows });
            })
            .catch((e) => {
                if (cancelled) return;
                setContractPlans({ status: "error", rows: [] });
                showNotification("error", "Failed to load contracts", e?.message || "");
            });
        return () => { cancelled = true; };
    }, [contractPickerOpen, authAxios, showNotification]);

    useEffect(() => {
        if (!exportOpen) return undefined;
        const onDown = (e) => { if (!exportRef.current?.contains(e.target)) setExportOpen(false); };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, [exportOpen]);

    useEffect(() => {
        authAxios.get(`${getApiBase()}/CVRDailyRates/current`)
            .then(({ data }) => {
                const rate = data?.rate;
                setDailyRate(rate != null && Number.isFinite(Number(rate)) ? Number(rate) : null);
            })
            .catch(() => setDailyRate(null));
    }, [authAxios]);

    useEffect(() => {
        const contractId = resolved?.contract?.ContractID
            ?? resolved?.contract?.contractId
            ?? resolved?.contract?.CTR_ContractID;
        if (!contractId || !authAxios) {
            setContractLocked(false);
            return;
        }
        authAxios.get(`${getApiBase()}/CVRComputation/lock-status`, {
            params: { contractIds: String(contractId) },
        })
            .then(({ data }) => setContractLocked(!!data?.[String(contractId)]?.locked))
            .catch(() => setContractLocked(false));
    }, [authAxios, resolved?.contract]);

    useEffect(() => {
        const main = document.querySelector(".app-body .main");
        const fluid = main?.querySelector(":scope > .container-fluid");
        if (!main) return undefined;

        const prevMainOverflowY = main.style.overflowY;
        const prevMainOverflowX = main.style.overflowX;
        const prevFluidHeight = fluid?.style.height ?? "";
        const prevFluidOverflow = fluid?.style.overflow ?? "";

        main.style.setProperty("overflow-y", "auto", "important");
        main.style.setProperty("overflow-x", "auto", "important");
        if (fluid) {
            fluid.style.height = "auto";
            fluid.style.overflow = "visible";
        }

        return () => {
            main.style.overflowY = prevMainOverflowY;
            main.style.overflowX = prevMainOverflowX;
            main.scrollTop = 0;
            if (fluid) {
                fluid.style.height = prevFluidHeight;
                fluid.style.overflow = prevFluidOverflow;
            }
        };
    }, []);

    const itemBreakdownColumns = useMemo(() => {
        const currencies = detailsModal.currencies ?? [];
        const effectiveCurrencies = currencies.length > 0 ? currencies : ["USD"];
        const amountCols = effectiveCurrencies.map((cur) => ({
            Header: `Net Purchases (${cur})`,
            accessor: `netSales_${cur}`,
            width: 140,
            style: { textAlign: "center" },
            Cell: (cell) => {
                const formatted = formatMetricAmount(cell.value, cur);
                return (
                    <div style={{ textAlign: "center" }}>
                        {mobileDualCell(
                            formatted,
                            mobileLabeledRow(`Net Purchases (${cur})`, formatted)
                        )}
                    </div>
                );
            },
        }));
        return [
            {
                Header: "Item Ref",
                accessor: "itemRef",
                minWidth: 100,
                style: { textAlign: "center" },
                Cell: (cell) => (
                    <div style={{ paddingLeft: 10, textAlign: "center" }}>
                        {mobileDualCell(cell.value, mobileLabeledRow("Item Ref", cell.value))}
                    </div>
                ),
            },
            {
                Header: "Description",
                accessor: "itemDesc",
                minWidth: 200,
                Cell: (cell) => mobileDualCell(cell.value, mobileLabeledRow("Description", cell.value)),
            },
            {
                Header: "Net Qty",
                accessor: "netQty",
                width: 90,
                style: { textAlign: "center" },
                Cell: (cell) => (
                    <div style={{ textAlign: "center" }}>
                        {mobileDualCell(cell.value, mobileLabeledRow("Net Qty", cell.value))}
                    </div>
                ),
            },
            ...amountCols,
        ];
    }, [detailsModal.currencies]);

    const itemBreakdownRows = useMemo(() => {
        const items = detailsModal.items ?? [];
        const currencies = detailsModal.currencies ?? [];
        const effectiveCurrencies = currencies.length > 0 ? currencies : ["USD"];

        const getItemAmount = (item, cur) => {
            if (cur === "USD") return Number(item.netSalesAmountUSD ?? item.netSalesAmount ?? 0);
            if (cur === "LBP") return Number(item.netSalesAmountLBP ?? 0);
            return 0;
        };

        const grouped = {};
        items.forEach((item) => {
            const key = `${item.itemRef}|${item.itemDesc}`;
            if (!grouped[key]) {
                grouped[key] = {
                    itemRef: item.itemRef ?? "-",
                    itemDesc: item.itemDesc ?? "-",
                    netQty: 0,
                };
                effectiveCurrencies.forEach((cur) => { grouped[key][`netSales_${cur}`] = 0; });
            }
            grouped[key].netQty += Number(item.netQty ?? 0);
            effectiveCurrencies.forEach((cur) => {
                grouped[key][`netSales_${cur}`] =
                    (grouped[key][`netSales_${cur}`] ?? 0) + getItemAmount(item, cur);
            });
        });

        return Object.values(grouped);
    }, [detailsModal.items, detailsModal.currencies]);

    const runComputation = useCallback(async (clientOpt, workspaceItem) => {
        setSelectedClient(clientOpt);
        setSelectedPlanItem(workspaceItem ?? null);
        resetWorkspace();
        if (!clientOpt?.value) return;

        setLoadingResolve(true);
        try {
            const res = await resolveClientPlan(clientOpt.value, authAxios, { workspaceItem });
            setResolved(res);
            if (res?.targets?.length) {
                await runPreview(res);
            }
            if (res?.planId) {
                await loadPayments(res.planId);
            }
        } catch (e) {
            console.error(e);
            showNotification("error", "Failed to resolve plan", e?.message || "");
            setResolved({ error: "This contract's plan couldn't be loaded." });
        } finally {
            setLoadingResolve(false);
        }
    }, [authAxios, resetWorkspace, runPreview, showNotification, loadPayments]);

    // picking a contract computes its plan for the contract's master supplier and all
    // associated suppliers (the same figures as before, reached by contract instead)
    const pickContractPlan = useCallback((row) => {
        if (!row?.contract?.ClientID) {
            showNotification("error", "This contract has no master supplier.");
            return;
        }
        setContractPickerOpen(false);
        void runComputation(row.contract.ClientID, row.workspaceItem);
    }, [runComputation, showNotification]);

    const refreshComputation = useCallback(() => {
        if (selectedClient && selectedPlanItem) void runComputation(selectedClient, selectedPlanItem);
    }, [runComputation, selectedClient, selectedPlanItem]);

    const contractPaging = usePagedRows(
        contractPlans.rows,
        (r) => `${r.reference} ${r.name} ${r.supplier} ${r.plan} ${r.currency}`,
        { initialPageSize: 25 }
    );
    const contractPickerColumns = useMemo(() => {
        const col = (Header, accessor, opts = {}) => ({
            Header,
            accessor,
            ...opts,
            Cell: (c) => {
                const content = mobileDualCell(c.value, mobileLabeledRow(Header, c.value));
                return opts.center ? <div className="w-100 text-center">{content}</div> : content;
            },
        });
        return [
            col("Reference", "reference", { width: 140, center: true, style: { textAlign: "center" } }),
            col("Contract", "name", { minWidth: 180 }),
            {
                ...col("Master supplier", "supplier", { minWidth: 200 }),
                Cell: (c) => mobileDualCell(
                    <span>{c.value}{c.original.subCount > 0 && <span className="text-muted"> +{c.original.subCount}</span>}</span>,
                    mobileLabeledRow("Master supplier", c.value)
                ),
            },
            col("Plan", "plan", { minWidth: 140 }),
            col("Period", "period", { width: 200, center: true, style: { textAlign: "center" } }),
            col("Currency", "currency", { width: 90, center: true, style: { textAlign: "center" } }),
        ];
    }, []);

    const settlementTypesMap = useMemo(
        () => buildSettlementTypesMap(resolved?.settlementTypeOptions ?? []),
        [resolved?.settlementTypeOptions]
    );

    const contractStartDate = resolved?.contract?.StartDate
        ?? resolved?.contract?.startDate
        ?? resolved?.contract?.CTR_StartDate
        ?? null;
    const contractEndDate = resolved?.contract?.EndDate
        ?? resolved?.contract?.endDate
        ?? resolved?.contract?.CTR_EndDate
        ?? null;

    const contractStartFormatted = contractStartDate && moment(contractStartDate).isValid()
        ? moment(contractStartDate).format("DD-MM-YYYY")
        : "-";
    const contractEndFormatted = contractEndDate && moment(contractEndDate).isValid()
        ? moment(contractEndDate).format("DD-MM-YYYY")
        : "-";

    const refreshSettlementData = useCallback(async () => {
        if (resolved?.planId) {
            await loadPayments(resolved.planId);
        }
    }, [loadPayments, resolved?.planId]);

    const handleProcessTarget = useCallback(async (target, targetResult, eligibility) => {
        if (!target || !eligibility) return;

        const locBlock = getLocationCashRegBlockMessage(
            userData?.locationValid,
            userData?.cashRegValid,
        );
        if (locBlock) {
            setBlockedModal({ open: true, message: locBlock });
            return;
        }

        if (eligibility.status === SETTLEMENT_STATUS.BLOCKED) {
            setBlockedModal({ open: true, message: eligibility.message ?? "Process is not available." });
            return;
        }

        if (eligibility.status !== SETTLEMENT_STATUS.ELIGIBLE) return;

        const resultKey = resolveTargetSalesKey(target);
        let sales = salesByTargetId[resultKey] ?? {};

        // Always Applied: confirm amounts must match Process (capped sales + period resolution).
        let trailingPeriod = null;
        if (!isConditionedTarget(target)) {
            try {
                const periodsCount = eligibility.periodsCount ?? 0;
                const period = getPeriodLength(target?.settlementTypeId, settlementTypesMap);
                const fixedAnchor = target?.fromDate ?? target?.FromDate;
                const targetFromDate = fixedAnchor;
                const targetEndDate = target?.toDate ?? target?.ToDate ?? null;
                const targetId = target?.targetId ?? target?.targetID ?? target?.TargetID;
                const periodsPaid = periodsPaidCountForTarget(
                    fixedAnchor,
                    period.value,
                    paymentsForTarget(payments, targetId),
                    contractEndDate,
                    targetEndDate
                );

                let exclusiveTo;
                if (eligibility.isFinalCatchUp) {
                    if (!targetEndDate) {
                        showNotification(
                            "error",
                            "Settlement failed ",
                            "Unable to resolve the trailing settlement period for this target."
                        );
                        return;
                    }
                    trailingPeriod = tryResolveFinalCatchUpPeriodRange(
                        fixedAnchor,
                        period.value,
                        periodsPaid,
                        targetFromDate,
                        targetEndDate
                    );
                    if (!trailingPeriod?.periodEnd?.isValid()) {
                        showNotification(
                            "error",
                            "Settlement failed ",
                            "Unable to resolve the trailing settlement period for this target."
                        );
                        return;
                    }
                    exclusiveTo = moment(targetEndDate).startOf("day");
                } else {
                    const covered = tryResolveCoveredPeriodRange(
                        fixedAnchor,
                        period.value,
                        periodsPaid,
                        periodsCount
                    );
                    if (!covered?.periodEnd?.isValid()) {
                        showNotification(
                            "error",
                            "Settlement failed ",
                            "Unable to resolve the closed settlement period for this target."
                        );
                        return;
                    }
                    exclusiveTo = covered.periodEnd.clone().startOf("day").add(1, "day");
                }

                const mapped = await fetchSalesForDraftWindows(
                    target,
                    resolved?.allClientIds ?? [],
                    [{ key: "payable", toDate: exclusiveTo.toDate() }]
                );
                const capped = mapped[`${resultKey}:payable`];
                if (!capped) {
                    showNotification(
                        "error",
                        "Settlement failed ",
                        "Unable to load capped purchases for confirmation."
                    );
                    return;
                }
                sales = capped;
            } catch (e) {
                const msg = e?.response?.data ?? e?.message ?? "Unable to load capped purchases for confirmation.";
                showNotification("error", "Settlement failed ", String(msg));
                return;
            }
        }

        const details = buildTargetConfirmDetails({
            target,
            targetResult,
            sales,
            contractCurrency: resolved?.contractCurrency ?? "USD",
            payments,
            periodsCount: eligibility.periodsCount ?? 0,
            isFinalCatchUp: eligibility.isFinalCatchUp ?? false,
            trailingPeriod,
        });

        setConfirmModal({ open: true, target, targetResult, details, inlineError: null, inlineErrorType: null });
    }, [
        contractEndDate,
        fetchSalesForDraftWindows,
        payments,
        resolved?.allClientIds,
        resolved?.contractCurrency,
        salesByTargetId,
        settlementTypesMap,
        showNotification,
        userData?.cashRegValid,
        userData?.locationValid,
    ]);

    // The API settles only saved computations, so the first settlement saves the plan's
    // computation (which also locks the contract), the way the reference does it.
    const ensureComputationSaved = useCallback(async () => {
        if (contractLocked) return;
        const planId = resolved?.planId;
        if (!planId) throw new Error("No plan to save.");
        await authAxios.post(`${getApiBase()}/CVRComputation/save`, { planId });
        setContractLocked(true);
    }, [authAxios, contractLocked, resolved?.planId]);

    const handleConfirmTargetProcess = useCallback(async () => {
        const target = confirmModal.target;
        if (!target) return;

        try {
            await ensureComputationSaved();
            await processTarget({
                targetId: target.targetId ?? target.targetID ?? target.TargetID,
                clientIds: resolved?.allClientIds ?? [],
            });
            showNotification(
                "success",
                `Settled: ${confirmModal.details?.targetName ?? "Target"} - ${fmtRebateAmount(confirmModal.details?.amountToProcess ?? 0, confirmModal.details?.currency)} ${confirmModal.details?.currency ?? ""}`.trim(),
                ""
            );
            setConfirmModal({ open: false, target: null, targetResult: null, details: null, inlineError: null, inlineErrorType: null });
            await refreshSettlementData();
        } catch (e) {
            const raw = e?.response?.data;
            const msg = typeof raw === "string"
                ? raw
                : raw?.title ?? raw?.message ?? e?.message ?? "Failed to process settlement.";
            setConfirmModal((prev) => ({
                ...prev,
                inlineError: String(msg),
                inlineErrorType: "danger",
            }));
        }
    }, [confirmModal.details, confirmModal.target, ensureComputationSaved, processTarget, refreshSettlementData, resolved?.allClientIds, showNotification]);

    const openFeeBatchModal = useCallback(() => {
        const locBlock = getLocationCashRegBlockMessage(
            userData?.locationValid,
            userData?.cashRegValid,
        );
        if (locBlock) {
            setBlockedModal({ open: true, message: locBlock });
            return;
        }

        const fees = resolved?.fees ?? [];
        const contractCurrency = resolved?.contractCurrency ?? "USD";
        const rows = fees.map((fee) => {
            const eligibility = getFeeEligibility({
                fee,
                payments,
                settlementTypesMap,
                contractStartDate,
                contractEndDate,
                contractCurrency,
            });
            const feeId = String(fee.feeId ?? fee.feeID ?? "");
            const { currency } = formatFeeAmount(fee);
            const isEligible = eligibility.status === SETTLEMENT_STATUS.ELIGIBLE;
            const processAmount = eligibility.processAmount ?? 0;
            const periodsCount = eligibility.periodsCount ?? 0;
            const settlementDisplay = isEligible && processAmount > 0
                ? formatProcessAmountWithPeriods(processAmount, currency, periodsCount)
                : "-";
            return {
                feeId,
                name: fee.typeLabel ?? "-",
                currency,
                status: eligibility.status,
                owedAmount: eligibility.owedAmount ?? eligibility.amountLeft ?? 0,
                processAmount,
                owedDisplay: `${fmtRebateAmount(eligibility.owedAmount ?? eligibility.amountLeft ?? 0, currency)}`,
                settlementDisplay,
                checked: false,
                disabled: !isEligible,
                note: eligibility.message ?? "",
            };
        });
        setFeeBatchModal({ open: true, rows, inlineError: null, inlineErrorType: null });
    }, [contractEndDate, contractStartDate, payments, resolved?.fees, resolved?.contractCurrency, settlementTypesMap, userData?.cashRegValid, userData?.locationValid]);

    const handleFeeBatchApply = useCallback(async () => {
        const selected = feeBatchModal.rows.filter((row) => row.checked && !row.disabled);
        if (!selected.length) {
            setFeeBatchModal((prev) => ({
                ...prev,
                inlineError: "Select at least one eligible fee to settle.",
                inlineErrorType: "warning",
            }));
            return;
        }

        const feeIds = selected.map((row) => Number(row.feeId)).filter((n) => n > 0);

        try {
            await ensureComputationSaved();
            await processFeesBatch({
                clientIds: resolved?.allClientIds ?? [],
                feeIds,
            });
            const n = selected.length;
            const title = n === 1
                ? `Settled 1 fee - ${selected[0].settlementDisplay ?? ""}`.trim()
                : `Settled ${n} fees`;
            showNotification("success", title, "");
            setFeeBatchModal({ open: false, rows: [], inlineError: null, inlineErrorType: null });
            await refreshSettlementData();
        } catch (e) {
            const raw = e?.response?.data;
            const msg = typeof raw === "string"
                ? raw
                : raw?.title ?? raw?.message ?? e?.message ?? "Failed to process fee settlements.";
            setFeeBatchModal((prev) => ({
                ...prev,
                inlineError: String(msg),
                inlineErrorType: "danger",
            }));
        }
    }, [feeBatchModal.rows, ensureComputationSaved, processFeesBatch, refreshSettlementData, resolved?.allClientIds, showNotification]);

    const updateFeeBatchRow = useCallback((feeId, patch) => {
        setFeeBatchModal((prev) => ({
            ...prev,
            inlineError: null,
            inlineErrorType: null,
            rows: prev.rows.map((row) => (
                row.feeId === feeId ? { ...row, ...patch } : row
            )),
        }));
    }, []);

    const feeBatchColumns = useMemo(
        () => buildFeeBatchModalColumns(updateFeeBatchRow),
        [updateFeeBatchRow]
    );

    // ── Grand total + subtotals (needed for export/print) ────────────────────

    const contractCurrency = resolved?.contractCurrency ?? "USD";

    const settlementTotals = useMemo(
        () => sumSettlementTotals({
            targets: resolved?.targets ?? [],
            targetResults: previewResults?.targetResults ?? [],
            salesByTargetId,
            fees: resolved?.fees ?? [],
            payments,
            contractCurrency,
        }),
        [resolved?.targets, previewResults?.targetResults, salesByTargetId, resolved?.fees, payments, contractCurrency]
    );

    const rebateTotal = settlementTotals.rebateOwed;
    const feeTotals = useMemo(() => ({ [contractCurrency]: settlementTotals.feesOwed }), [settlementTotals.feesOwed, contractCurrency]);
    const grandTotal = settlementTotals.grandOwed;

    const grandTotalUSD = grandTotal;
    const currencySubtotals = useMemo(() => {
        const out = {};
        if (rebateTotal) out[contractCurrency] = rebateTotal;
        return out;
    }, [rebateTotal, contractCurrency]);

    // ── Export / Print handlers ───────────────────────────────────────────────

    // Excel / printed report: one document (contract, totals, fees, targets, settlements),
    // built like the reference project's computation report
    const documentParams = useMemo(() => ({
        resolved,
        previewResults,
        salesByTargetId,
        salesMetaByTargetId,
        payments,
        contractCurrency,
        locked: contractLocked,
        lastAccountingGenerationDate,
    }), [resolved, previewResults, salesByTargetId, salesMetaByTargetId, payments, contractCurrency, contractLocked, lastAccountingGenerationDate]);

    const handleExportExcel = useCallback(() => {
        setExportOpen(false);
        if (!previewResults) return;
        exportComputationDocumentToExcel(documentParams)
            .catch(() => showNotification("error", "The export failed."));
    }, [documentParams, previewResults, showNotification]);

    const handlePrint = useCallback(async () => {
        setExportOpen(false);
        if (!previewResults) return;
        if (!printComputationDocument(documentParams, await loadCompanyName())) {
            showNotification("error", "Allow pop-ups for this site to print the report.");
        }
    }, [documentParams, previewResults, showNotification]);

    // ─────────────────────────────────────────────────────────────────────────

    const openTargetDetails = useCallback(async (target) => {
        const allClientIds = resolved?.allClientIds ?? [selectedClient?.value].filter(Boolean);
        const targetId = target?.targetId ?? target?.TargetID ?? target?.targetID;
        const targetName = target?.targetName ?? target?.TargetName ?? "";
        if (!allClientIds.length || targetId == null) return;

        setDetailsModal({
            open: true, targetId, targetName, items: [], currencies: [], loading: true,
        });

        try {
            const { data } = await authAxios.get(`${getApiBase()}/CVRComputation/items`, {
                params: {
                    supCodes: allClientIds.join(","),
                    targetId,
                },
            });
            setDetailsModal((prev) => ({
                ...prev,
                items: data?.items ?? [],
                currencies: data?.currencies ?? [],
                loading: false,
            }));
        } catch (e) {
            showNotification("error", "Failed to load purchase details", e?.message || "");
            setDetailsModal((prev) => ({ ...prev, open: false, loading: false }));
        }
    }, [authAxios, resolved, selectedClient?.value, showNotification]);

    const isLoading = loadingResolve || loadingSales;
    const contract = resolved?.contract ?? null;
    const subSuppliers = contract?.SubClients ?? [];
    const progress = (() => {
        if (!contractStartDate || !contractEndDate) return null;
        const start = moment(contractStartDate).startOf("day");
        const end = moment(contractEndDate).startOf("day");
        const now = moment();
        if (now.isBefore(start)) return { pct: 0, label: "Not started" };
        if (!now.isBefore(end)) return { pct: 100, label: "Ended" };
        return { pct: Math.round((now.diff(start) / Math.max(1, end.diff(start))) * 100), label: `${end.diff(now, "days")} days left` };
    })();

    return (
        <div className="py-3 px-3 cvr-workspace-root cvr-ws" style={{ height: "auto", overflow: "visible" }}>
            <div className="d-flex justify-content-between align-items-start mb-3">
                <div><h5 className="mb-1">Computation</h5></div>
            </div>

            {!contract || resolved?.error ? (
                <div className="cvr-ws-start">
                    <span className="cvr-ws-start-icon"><Calculator size={22} /></span>
                    <p className="cvr-ws-start-title">
                        {loadingResolve ? "Loading contract…" : resolved?.error ?? "Select a contract to compute its rebates and fees"}
                    </p>
                    {!loadingResolve && (
                        <button type="button" className="ds-btn ds-btn-primary" onClick={() => setContractPickerOpen(true)}>
                            <FileSearch size={16} />
                            Select contract
                        </button>
                    )}
                </div>
            ) : (
                <section className="cvr-ws-header">
                    <div className="cvr-ws-header-main">
                        <div className="cvr-ws-header-ref ds-mono">{contract.ContractReference}</div>
                        <h2 className="cvr-ws-header-name">{contract.ContractName || resolved?.plan?.planName}</h2>
                        <div className="cvr-ws-header-meta">
                            <span title={subSuppliers.map((s) => s.ClientID?.label).filter(Boolean).join(", ")}>
                                <Users size={14} /> {contract.ClientID?.label ?? selectedClient?.label}
                                {subSuppliers.length > 0 && <em> +{subSuppliers.length}</em>}
                            </span>
                            <span>Plan: <strong>{resolved?.plan?.planName ?? "-"}</strong></span>
                            <span>{contractStartFormatted} to {contractEndFormatted}</span>
                            <span className="cvr-ws-currency">{contractCurrency}</span>
                            {contractLocked && <span className="ds-badge is-locked" title="Has saved computations, read-only"><Lock size={11} /> Locked</span>}
                        </div>
                        {progress && (
                            <div className="cvr-ws-progress">
                                <span className="cvr-ws-progress-track"><span style={{ width: `${progress.pct}%` }} /></span>
                                <span>{progress.label}</span>
                            </div>
                        )}
                    </div>
                    <div className="cvr-ws-header-actions">
                        <button type="button" className="ds-btn ds-btn-secondary" onClick={() => setContractPickerOpen(true)} disabled={isLoading}>
                            <FileSearch size={16} />
                            Change
                        </button>
                        <button
                            type="button"
                            className="ds-btn ds-btn-secondary cvr-ws-icon-btn"
                            onClick={refreshComputation}
                            disabled={isLoading}
                            title="Refresh purchases"
                            aria-label="Refresh purchases"
                        >
                            <RefreshCw size={16} className={isLoading ? "cvr-ws-spin" : ""} />
                        </button>
                        <div className="ds-menu-anchor" ref={exportRef}>
                            <button
                                type="button"
                                className="ds-btn ds-btn-secondary"
                                aria-haspopup="menu"
                                aria-expanded={exportOpen}
                                onClick={() => setExportOpen((o) => !o)}
                                disabled={!previewResults || isLoading}
                            >
                                <Download size={16} />
                                Export
                                <ChevronDown size={16} />
                            </button>
                            {exportOpen && (
                                <div className="ds-menu ce-menu-right" role="menu">
                                    <button type="button" role="menuitem" className="ds-menu-item" onClick={handleExportExcel}>
                                        <FileSpreadsheet size={16} />
                                        Export to Excel
                                    </button>
                                    <button type="button" role="menuitem" className="ds-menu-item" onClick={() => void handlePrint()}>
                                        <Printer size={16} />
                                        Print report
                                    </button>
                                </div>
                            )}
                        </div>
                        <button
                            type="button"
                            className="ds-btn ds-btn-primary"
                            onClick={() => setTotalBreakdownSignal((n) => n + 1)}
                            disabled={!previewResults || isLoading}
                        >
                            <Scale size={16} />
                            Total breakdown
                        </button>
                    </div>
                </section>
            )}

            {loadingResolve && contract && <LoadingStep message="Loading contract..." />}
            {loadingSales && !loadingResolve && (
                <LoadingStep message={`Loading purchase data for ${resolved?.allClientIds?.length ?? 1} supplier${(resolved?.allClientIds?.length ?? 1) !== 1 ? "s" : ""}...`} />
            )}

            {previewResults && !isLoading && (
                <ComputationResultsPanel
                    resolved={resolved}
                    previewResults={previewResults}
                    salesByTargetId={salesByTargetId}
                    salesMetaByTargetId={salesMetaByTargetId}
                    loadingSales={loadingSales || loadingPayments}
                    isLoading={isLoading}
                    dailyRate={dailyRate}
                    // Process is hidden for now (the settlement flow and API are unchanged)
                    showProcessButton={false}
                    payments={payments}
                    showBreakdowns
                    fetchSalesForDraftWindows={fetchSalesForDraftWindows}
                    allClientIds={resolved?.allClientIds ?? []}
                    asOf={moment().format("YYYY-MM-DD")}
                    lastAccountingGenerationDate={lastAccountingGenerationDate}
                    onOpenDetails={(target) => void openTargetDetails(target)}
                    onProcessTarget={handleProcessTarget}
                    onProcessFees={openFeeBatchModal}
                    totalBreakdownSignal={totalBreakdownSignal}
                />
            )}

            {/* Contract picker (one row per plan of an active contract) */}
            <ModalComp
                modal={contractPickerOpen}
                modalTitle="Select contract"
                modalBody={(
                    <>
                        <div className="text-muted small mb-2">Click a contract to compute it.</div>
                        <div className="adv-mobile-table">
                            <AdvancedTable
                                columns={contractPickerColumns}
                                dataArray={contractPaging.pageRows}
                                enableSearch
                                isFilterOptionOneRow
                                triggerPaging={contractPaging.onSearch}
                                hidePager
                                minRows={0}
                                showPagination={false}
                                recordCount={contractPaging.total}
                                pageSize={contractPaging.pageSize}
                                currentPage={contractPaging.page}
                                getTrProps={(_state, rowInfo) => (rowInfo?.original ? {
                                    onClick: () => pickContractPlan(rowInfo.original),
                                    style: { cursor: "pointer" },
                                    title: "Compute this contract",
                                } : {})}
                                maxHeight="none"
                            />
                        </div>
                        {contractPlans.status === "loading" && <LoadingStep message="Loading contracts..." />}
                        {contractPlans.status === "ready" && !contractPlans.rows.length && (
                            <div className="text-muted small mt-2">No active contract has a plan yet.</div>
                        )}
                        <Pagination
                            page={contractPaging.page}
                            pageSize={contractPaging.pageSize}
                            total={contractPaging.total}
                            onPageChange={contractPaging.setPage}
                            onPageSizeChange={contractPaging.setPageSize}
                            pageSizes={[25, 50, 100]}
                        />
                        <div className="picker-modal-footer">
                            <button type="button" className="ds-btn ds-btn-secondary" onClick={() => setContractPickerOpen(false)}>
                                Cancel
                            </button>
                        </div>
                    </>
                )}
                onClose={() => setContractPickerOpen(false)}
                hideFooterButtons
                showCloseIcon
                size="xl"
                className="picker-modal"
            />

            {/* Sales details modal */}
            <ModalComp
                modal={detailsModal.open}
                modalTitle={`Purchase Details - ${detailsModal.targetName}`}
                modalBody={(() => {
                    if (detailsModal.loading) {
                        return (
                            <div className="d-flex align-items-center gap-2 text-muted py-3">
                                <div className="spinner-border spinner-border-sm text-secondary" role="status" />
                                <span>Loading purchase details...</span>
                            </div>
                        );
                    }
                    const items = detailsModal.items ?? [];
                    if (!items.length) {
                        return <div className="text-muted">No purchase data found for this period</div>;
                    }
                    const currencies = detailsModal.currencies ?? [];
                    const effectiveCurrencies = currencies.length > 0 ? currencies : ["USD"];
                    return (
                        <div className="adv-mobile-table">
                            <AdvancedTable
                                columns={itemBreakdownColumns}
                                dataArray={itemBreakdownRows}
                                enableSearch
                                minRows={0}
                                showPagination={false}
                                isFilterOptionOneRow
                                maxHeight="420px"
                            />
                            <div className="d-flex flex-column align-items-end gap-1 fw-bold border-top pt-2 mt-2 small">
                                <span>Total Net Qty: {fmtQty(itemBreakdownRows.reduce((s, row) => s + (row.netQty ?? 0), 0))}</span>
                                {effectiveCurrencies.map((cur) => (
                                    <span key={cur}>
                                        Total ({cur}): {formatMetricAmount(itemBreakdownRows.reduce((s, row) => s + (row[`netSales_${cur}`] ?? 0), 0), cur)}
                                    </span>
                                ))}
                            </div>
                        </div>
                    );
                })()}
                onClose={() => setDetailsModal((prev) => ({ ...prev, open: false }))}
                onCloseText="Close"
                size="xl"
            />

            <ModalComp
                modal={blockedModal.open}
                modalTitle="Process unavailable"
                modalBody={<p className="mb-0" style={{ whiteSpace: "pre-line" }}>{blockedModal.message}</p>}
                onClose={() => setBlockedModal({ open: false, message: "" })}
                onCloseText="OK"
                size="md"
            />

            <ModalComp
                modal={confirmModal.open}
                modalTitle="Confirm settlement payment"
                modalBody={confirmModal.details ? (
                    <div className="d-flex flex-column gap-2">
                        {confirmModal.inlineError && (
                            <div className={`alert alert-${confirmModal.inlineErrorType === "danger" ? "danger" : "warning"} py-2 px-3 mb-0`}>
                                {confirmModal.inlineError}
                            </div>
                        )}
                        {!contractLocked && (
                            <div className="alert alert-info py-2 px-3 mb-0 small">
                                Processing saves this computation and locks the contract for editing.
                            </div>
                        )}
                        <div><strong>Target:</strong> {confirmModal.details.targetName}</div>
                        <div><strong>Period:</strong> {confirmModal.details.period}</div>
                        {confirmModal.details.isConditioned ? (
                            <>
                                <div><strong>Status:</strong> Achieved</div>
                                <div><strong>Rebate owed:</strong> {fmtRebateAmount(confirmModal.details.owedAmount, confirmModal.details.currency)} {confirmModal.details.currency}</div>
                                <div><strong>Rebate settled:</strong> {fmtRebateAmount(confirmModal.details.settledAmount, confirmModal.details.currency)} {confirmModal.details.currency}</div>
                                <div><strong>Amount to process:</strong> {fmtRebateAmount(confirmModal.details.amountToProcess, confirmModal.details.currency)} {confirmModal.details.currency}</div>
                                <div><strong>Total purchases at process:</strong> {formatMetricAmount(confirmModal.details.totalSales, confirmModal.details.currency)} {confirmModal.details.currency}</div>
                                <p className="text-muted small mb-0 mt-2">{confirmModal.details.footerNote}</p>
                            </>
                        ) : (
                            <>
                                <div><strong>Cumulative rebate:</strong> {fmtRebateAmount(confirmModal.details.currentTotal, confirmModal.details.currency)} {confirmModal.details.currency}</div>
                                <div><strong>Already settled:</strong> {fmtRebateAmount(confirmModal.details.settledAmount, confirmModal.details.currency)} {confirmModal.details.currency}</div>
                                <div><strong>Currently owed:</strong> {fmtRebateAmount(confirmModal.details.owedAmount, confirmModal.details.currency)} {confirmModal.details.currency}</div>
                                <div><strong>Amount to process (this settlement):</strong>{" "}
                                    {formatProcessAmountWithPeriods(
                                        confirmModal.details.amountToProcess,
                                        confirmModal.details.currency,
                                        confirmModal.details.periodsCount ?? 0
                                    )}
                                </div>
                                <div><strong>Total purchases at process:</strong> {formatMetricAmount(confirmModal.details.totalSales, confirmModal.details.currency)} {confirmModal.details.currency}</div>
                                {confirmModal.details.footerNote && (
                                    <p className="text-muted small mb-0 mt-2">{confirmModal.details.footerNote}</p>
                                )}
                            </>
                        )}
                    </div>
                ) : null}
                onAccept={() => void handleConfirmTargetProcess()}
                onAcceptText={processing ? "Processing..." : "Confirm"}
                onClose={() => setConfirmModal({ open: false, target: null, targetResult: null, details: null, inlineError: null, inlineErrorType: null })}
                onCloseText="Cancel"
                size="md"
            />

            <ModalComp
                modal={feeBatchModal.open}
                className="cvr-fee-batch-modal"
                modalTitle="Process fee settlements"
                modalBody={(
                    <>
                        {feeBatchModal.inlineError && (
                            <div className={`alert alert-${feeBatchModal.inlineErrorType === "danger" ? "danger" : "warning"} py-2 px-3 mb-2`}>
                                {feeBatchModal.inlineError}
                            </div>
                        )}
                        {!contractLocked && (
                            <div className="alert alert-info py-2 px-3 mb-2 small">
                                Processing saves this computation and locks the contract for editing.
                            </div>
                        )}
                        <div className="adv-mobile-table cvr-fee-batch-table-wrap">
                            <AdvancedTable
                                columns={feeBatchColumns}
                                dataArray={feeBatchModal.rows}
                                minRows={0}
                                showPagination={false}
                            />
                        </div>
                    </>
                )}
                onAccept={() => void handleFeeBatchApply()}
                onAcceptText={processing ? "Applying..." : "Apply"}
                onClose={() => setFeeBatchModal({ open: false, rows: [], inlineError: null, inlineErrorType: null })}
                onCloseText="Cancel"
                size="lg"
            />

        </div>
    );
}