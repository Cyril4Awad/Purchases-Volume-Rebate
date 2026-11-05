import { useContext, useEffect, useMemo, useRef, useState, useCallback } from "react";
import "../../ui/ui.css";
import "./styles/contractEditor.css";
import { ChevronDown, Download, FileSpreadsheet, Plus, Printer } from "lucide-react";
import axios from "axios";
import { getApiBase } from "../../globals";
import { AuthContext } from "../../ContextProvider/AuthContext";
import {
    fetchAndMapContracts,
    mergeContractRecordsForValidation,
    upsertContractInRecords,
} from "../../utils/contractWorkspaceMappers";
import { AdvancedTable, ModalComp } from "../../ReusableComponents";
import { useToaster } from "../../ui/toast/Toaster";
import { triggerSessionExpired } from "../../utils/sessionExpired";
import { updateTokenFromResponse } from "../../utils/updateTokenFromResponse";
import { apiErrorMessage } from "../../utils/apiClient";
import PlanEditorModal from "./editor/PlanEditorModal/PlanEditorModal";
import {
    normalizePlanDraft,
    validatePlanDraft,
} from "../../utils/planWorkspaceValidation";
import {
    contractNeedsPersist,
    persistPlanContract,
} from "./utils/persistPlanContract";
import { exportContractToExcel, printContractReport } from "./utils/contractReport";
import { exportContractsToExcel, printContractsReport } from "../../utils/exportContractsList";
import { loadCompanyName } from "../../utils/appSettings";
import "./styles/VRPlansWorkspace.css";
import {
    mapApiPlanToDraft,
    mapDraftToPayload,
    createEmptyPlanDraft,
    getProp,
    hydrateContractDraft,
    hydratePlanDraftCurrencies,
    mapCurrencyOptionsFromApi,
    resolvePlanContractId,
} from "../../utils/planWorkspaceMappers";
import { buildPlanTableRow, getPlanWorkspaceTableColumns } from "../../utils/planWorkspaceTable";
import cloneDraft from "../../utils/cloneDraft";
import usePagedRows from "../../utils/usePagedRows";
import Pagination from "../../ui/Pagination";

const PAGE_SIZE_KEY = "cvr.contracts.pageSize";
const readPageSize = () => {
    try { return Number(localStorage.getItem(PAGE_SIZE_KEY)) || 25; } catch { return 25; }
};

// ─── Module-level workspace cache ─────────────────────────────────────────────
// Shared with computationPlanResolver so it never re-fetches what Plans already loaded.
// TTL: 2 minutes — stale after a save or explicit refresh.
const workspaceCache = {
    data: null,
    timestamp: 0,
    TTL_MS: 2 * 60 * 1000,
    isValid() { return this.data != null && (Date.now() - this.timestamp) < this.TTL_MS; },
    set(data) { this.data = data; this.timestamp = Date.now(); },
    invalidate() { this.data = null; this.timestamp = 0; },
};
export { workspaceCache };
// ──────────────────────────────────────────────────────────────────────────────

const toArray = (data) => (Array.isArray(data) ? data : []);

const EMPTY_MODAL_VALIDATION = {
    errors: [],
    fieldErrorsByTarget: {},
    fieldErrorsByFee: {},
    fieldErrorsContract: {},
};

const getErrMsg = (err) => {
    const data = err?.response?.data;
    if (data?.error && typeof data.error === "object") return JSON.stringify(data.error);
    if (data?.error) return String(data.error);
    if (typeof data?.message === "string" && data.message) return data.message;
    return apiErrorMessage(err, err?.message || "An unexpected error occurred");
};

export default function VRPlansWorkspace() {
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

    const [contractRecords, setContractRecords]       = useState([]);
    const [clientLabelById, setClientLabelById]       = useState({});
    const [typeOptions, setTypeOptions]               = useState([]);
    const [computationTypeOptions, setComputationTypeOptions] = useState([]);
    const [settlementTypeOptions, setSettlementTypeOptions]   = useState([]);
    const [currencyOptions, setCurrencyOptions]       = useState([]);
    const [records, setRecords]                       = useState([]);
    const [loading, setLoading]                       = useState(false);
    const [modalOpen, setModalOpen]                   = useState(false);
    const [editingDraft, setEditingDraft]             = useState(null);
    const [modalValidation, setModalValidation] = useState(EMPTY_MODAL_VALIDATION);
    const toast = useToaster();
    const [usdRate, setUsdRate] = useState(null);
    const [lockStatusByContractId, setLockStatusByContractId] = useState({});
    const [editingReadOnly, setEditingReadOnly] = useState(false);

    const tempIdRef = useRef(-1);
    const lookupsRef = useRef({});

    const [saving, setSaving] = useState(false);

    // (reference) side toasts instead of the inline banner
    const showNotification = useCallback((type, title, message = "") => {
        const text = message ? `${title}: ${message}` : title;
        (toast[type] ?? toast.info)(text);
    }, [toast]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            // No fallback to an empty list: without the saved contracts every contract would
            // look changed and the next Save would re-send all of them. Failing here keeps
            // the list that is already on screen.
            const contractPromise = fetchAndMapContracts(authAxios).catch((e) => {
                const err = new Error(`Failed to load contracts: ${getErrMsg(e)}`);
                err.contractsLoad = true;
                throw err;
            });

            const currenciesPromise = authAxios
                .get(`${getApiBase()}/CVRPlanWorkspace/appCurrencies`)
                .catch(() => ({ data: [] }));

            const [contractResult, typesRes, compRes, settRes, workspaceRes, currenciesRes] = await Promise.all([
                contractPromise,
                authAxios.get(`${getApiBase()}/CVRTypes`),
                authAxios.get(`${getApiBase()}/CVRComputationTypes`),
                authAxios.get(`${getApiBase()}/CVRSettlementTypes`),
                authAxios.get(`${getApiBase()}/CVRPlanWorkspace`),
                currenciesPromise,
            ]);

            const typesData = typesRes.data;
            const compData = compRes.data;
            const settData = settRes.data;
            const workspaceData = workspaceRes.data;

            workspaceCache.set(workspaceData);

            const currencyOpts = mapCurrencyOptionsFromApi(currenciesRes?.data ?? []);
            setCurrencyOptions(currencyOpts);

            const { mappedContracts, labelMap } = contractResult;
            setContractRecords(mappedContracts);
            setClientLabelById(labelMap);

            const types = toArray(typesData).map((t) => ({
                value: String(getProp(t, "VRT_TypeID") ?? t.typeID ?? ""),
                label: getProp(t, "VRT_TypeName") ?? t.typeName ?? "",
                active: !!getProp(t, "VRT_Active"),
            }));
            const compTypes = toArray(compData).map((t) => ({
                value: String(t.FRT_ComputationTypeID ?? t.fRT_ComputationTypeID ?? t.computationTypeID ?? ""),
                label: t.FRT_ComputationTypeName ?? t.fRT_ComputationTypeName ?? t.computationTypeName ?? "",
                active: !!getProp(t, "FRT_Active"),
            }));
            const settTypes = toArray(settData).map((t) => ({
                value: String(t.STT_SettlementTypeID ?? t.sTT_SettlementTypeID ?? t.settlementTypeID ?? ""),
                label: t.STT_SettlementTypeName ?? t.sTT_SettlementTypeName ?? t.settlementTypeName ?? "",
                periodLength: Number(t.STT_PeriodLength ?? t.sTT_PeriodLength ?? t.periodLength ?? 0),
                active: !!getProp(t, "STT_Active"),
            }));

            setTypeOptions(types);
            setComputationTypeOptions(compTypes);
            setSettlementTypeOptions(settTypes);

            const lookups = {
                contractRecords: mappedContracts,
                types, compTypes, settTypes,
                currencyOpts,
            };
            lookupsRef.current = lookups;

            setRecords(
                toArray(workspaceData)
                    .map((item) => mapApiPlanToDraft(item, lookups))
                    .filter(Boolean)
            );
            return true;
        } catch (e) {
            console.error(e);
            if (e?.contractsLoad) showNotification("error", e.message);
            else showNotification("error", "Failed to load data", getErrMsg(e));
            return false;
        } finally {
            setLoading(false);
        }
    }, [authAxios, showNotification]);

    const loadLockStatuses = useCallback(async (planRecords) => {
        const ids = [...new Set(
            planRecords
                .map((r) => resolvePlanContractId(r))
                .filter((id) => id != null && Number(id) > 0)
        )];
        if (!ids.length) {
            setLockStatusByContractId({});
            return;
        }
        try {
            const { data } = await authAxios.get(`${getApiBase()}/CVRComputation/lock-status`, {
                params: { contractIds: ids.join(",") },
            });
            setLockStatusByContractId(data ?? {});
        } catch {
            setLockStatusByContractId({});
        }
    }, [authAxios]);

    useEffect(() => {
        if (records.length) void loadLockStatuses(records);
    }, [records, loadLockStatuses]);

    const isContractLocked = useCallback((row) => {
        const cid = resolvePlanContractId(row?._draft ?? row);
        if (cid == null) return false;
        return lockStatusByContractId[String(cid)]?.locked === true;
    }, [lockStatusByContractId]);

    useEffect(() => {
        authAxios.get(`${getApiBase()}/CVRDailyRates/current`)
            .then(({ data }) => setUsdRate(data?.rate ?? null))
            .catch(() => setUsdRate(null));
    }, [authAxios]);

    useEffect(() => { void fetchData(); }, [fetchData]);

    const visibleRecords = useMemo(
        () => records.filter((r) => r._status !== "deleted"),
        [records]
    );

    const contractRecordsForValidation = useMemo(
        () => mergeContractRecordsForValidation(contractRecords, records),
        [contractRecords, records]
    );

    const tableRows = useMemo(
        () => visibleRecords.map((r) => buildPlanTableRow(r, contractRecords)),
        [visibleRecords, contractRecords]
    );

    // (reference) paged table, 25 rows by default, the chosen size is remembered
    const contractsPaging = usePagedRows(
        tableRows,
        (r) => [r.contractLabel, r.planName, r.typeLabel, r.startDate, r.endDate, r.activeLabel === "Yes" ? "active" : "inactive"].join(" "),
        { initialPageSize: readPageSize() }
    );
    const changeContractsPageSize = (size) => {
        contractsPaging.setPageSize(size);
        try { localStorage.setItem(PAGE_SIZE_KEY, String(size)); } catch { /* private mode */ }
    };

    const openAdd = () => {
        const id = tempIdRef.current--;
        setModalValidation(EMPTY_MODAL_VALIDATION);
        setEditingReadOnly(false);
        setEditingDraft(createEmptyPlanDraft(id));
        setModalOpen(true);
    };

    const openEdit = useCallback((row) => {
        setModalValidation(EMPTY_MODAL_VALIDATION);
        setEditingReadOnly(isContractLocked(row));
        const cloned = cloneDraft(row._draft);
        setEditingDraft(hydratePlanDraftCurrencies(
            hydrateContractDraft(cloned, contractRecords),
            currencyOptions
        ));
        setModalOpen(true);
    }, [contractRecords, currencyOptions, isContractLocked]);

    // Contracts created by a save whose plan step then failed, by record: the retry updates
    // them instead of creating them again (which would fail on the unique reference).
    const createdContractsRef = useRef(new Map());

    // The modal's Save: validates, then saves this contract and its plan to the database
    // right away (same API as before: the contract, then the plan through bulk-save) and
    // reloads the list. Returns true when saved, so the modal can close.
    const saveContractFromModal = async (draft) => {
        const normalized = normalizePlanDraft(draft, currencyOptions);
        const {
            valid,
            errors,
            fieldErrorsByTarget,
            fieldErrorsByFee,
            fieldErrorsContract,
        } = validatePlanDraft(normalized, { usdRate, currencyOpts: currencyOptions, settlementTypeOptions });
        if (!valid) {
            setModalValidation({
                errors,
                fieldErrorsByTarget: fieldErrorsByTarget || {},
                fieldErrorsByFee: fieldErrorsByFee || {},
                fieldErrorsContract: fieldErrorsContract || {},
            });
            return false;
        }

        let withContract = { ...normalized };
        const cd = withContract.contractDraft;
        if (cd && !cd._isNew && cd.ContractID && !String(cd.ContractID).startsWith("new_")) {
            const n = Number(cd.ContractID);
            if (Number.isFinite(n) && n > 0) withContract.planContractId = n;
        }
        let snapshot = [...contractRecords];
        const created = createdContractsRef.current.get(withContract.recordId);
        if (created && withContract.contractDraft?._isNew) {
            withContract = {
                ...withContract,
                planContractId: created.ContractID,
                contractDraft: { ...withContract.contractDraft, ContractID: created.ContractID, _isNew: false },
            };
            snapshot = upsertContractInRecords(snapshot, created);
        }

        const isNewPlan = withContract.recordId < 0;
        const loadingId = toast.loading(isNewPlan ? "Saving the new contract…" : "Saving the contract…");
        setSaving(true);
        try {
            const prepared = await prepareDraftForSave(withContract, snapshot);
            if (prepared.contractDraft && withContract.contractDraft?._isNew) {
                createdContractsRef.current.set(withContract.recordId, cloneDraft(prepared.contractDraft));
            }
            const payload = mapDraftToPayload(prepared);
            await authAxios.post(`${getApiBase()}/CVRPlanWorkspace/bulk-save`, {
                newPlans: isNewPlan ? [payload] : [],
                modifiedPlans: isNewPlan ? [] : [payload],
                deletedPlanIds: [],
            });
            createdContractsRef.current.delete(withContract.recordId);
            workspaceCache.invalidate();
            const refreshed = await fetchData();
            toast.dismiss(loadingId);
            if (refreshed) showNotification("success", isNewPlan ? "Contract saved" : "Contract updated");
            else showNotification("warning", "Saved, but the list couldn't be reloaded", "Refresh the page.");
            setModalOpen(false);
            setEditingDraft(null);
            setModalValidation(EMPTY_MODAL_VALIDATION);
            return true;
        } catch (e) {
            toast.dismiss(loadingId);
            workspaceCache.invalidate();
            showNotification("error", "Save failed", getErrMsg(e));
            return false;
        } finally {
            setSaving(false);
        }
    };

    const [toDelete, setToDelete] = useState(null);

    const handleDelete = useCallback((recordId) => {
        const row = records.find((r) => r.recordId === recordId);
        if (!row) return;
        if (isContractLocked(row)) {
            showNotification("error", "Contract locked", "This contract cannot be deleted after computation save.");
            return;
        }
        setToDelete(row);
    }, [records, showNotification, isContractLocked]);

    const confirmDelete = async () => {
        const row = toDelete;
        if (!row) return;
        setToDelete(null);
        if (!(row.recordId > 0)) return;
        const loadingId = toast.loading("Deleting the contract…");
        setSaving(true);
        try {
            await authAxios.post(`${getApiBase()}/CVRPlanWorkspace/bulk-save`, {
                newPlans: [], modifiedPlans: [], deletedPlanIds: [row.recordId],
            });
            workspaceCache.invalidate();
            await fetchData();
            toast.dismiss(loadingId);
            showNotification("success", "Contract deleted");
        } catch (e) {
            toast.dismiss(loadingId);
            showNotification("error", "Delete failed", getErrMsg(e));
        } finally {
            setSaving(false);
        }
    };

    const prepareDraftForSave = async (row, recordsSnapshot) => {
        let draft = hydrateContractDraft(normalizePlanDraft(row, currencyOptions), recordsSnapshot);
        if (!contractNeedsPersist(draft.contractDraft, recordsSnapshot)) return draft;
        const contractId = await persistPlanContract(authAxios, draft.contractDraft, recordsSnapshot);
        return {
            ...draft,
            planContractId: contractId,
            contractDraft: { ...draft.contractDraft, ContractID: contractId, _isNew: false },
        };
    };

    // ── exports: the whole list (header menu) and one contract (row buttons) ──
    const [exportOpen, setExportOpen] = useState(false);
    const exportRef = useRef(null);
    useEffect(() => {
        if (!exportOpen) return undefined;
        const onDown = (e) => { if (!exportRef.current?.contains(e.target)) setExportOpen(false); };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, [exportOpen]);

    // every contract matching the search, not just the page shown
    const runListExport = async (kind) => {
        setExportOpen(false);
        const rows = contractsPaging.filteredRows ?? [];
        if (!rows.length) {
            showNotification("info", "No contracts to export.");
            return;
        }
        try {
            if (kind === "excel") await exportContractsToExcel(rows, { isLocked: isContractLocked });
            else if (!printContractsReport(rows, { isLocked: isContractLocked, companyName: await loadCompanyName() })) {
                showNotification("error", "Allow pop-ups for this site to print the report.");
            }
        } catch (e) {
            showNotification("error", "The export failed.", getErrMsg(e));
        }
    };

    const reportLookups = useMemo(() => ({ settTypes: settlementTypeOptions ?? [] }), [settlementTypeOptions]);
    const draftForReport = useCallback((row) => hydratePlanDraftCurrencies(
        hydrateContractDraft(cloneDraft(row._draft), contractRecords),
        currencyOptions
    ), [contractRecords, currencyOptions]);

    const exportRowExcel = useCallback((row) => {
        exportContractToExcel(draftForReport(row), reportLookups)
            .catch(() => showNotification("error", "The export failed."));
    }, [draftForReport, reportLookups, showNotification]);

    const printRowReport = useCallback(async (row) => {
        const name = await loadCompanyName();
        printContractReport(draftForReport(row), reportLookups, name);
    }, [draftForReport, reportLookups]);

    const columns = useMemo(
        () => getPlanWorkspaceTableColumns({
            includeActions: true,
            openEdit,
            handleDelete,
            isContractLocked,
            onExcel: exportRowExcel,
            onReport: (row) => void printRowReport(row),
        }),
        [openEdit, handleDelete, isContractLocked, exportRowExcel, printRowReport]
    );

    const exportMenu = (
        <div className="ds-menu-anchor" ref={exportRef}>
            <button
                type="button"
                className="ds-btn ds-btn-secondary"
                aria-haspopup="menu"
                aria-expanded={exportOpen}
                onClick={() => setExportOpen((o) => !o)}
                disabled={loading}
            >
                <Download size={16} />
                Export
                <ChevronDown size={16} />
            </button>
            {exportOpen && (
                <div className="ds-menu ce-menu-right" role="menu">
                    <button type="button" role="menuitem" className="ds-menu-item" onClick={() => void runListExport("excel")}>
                        <FileSpreadsheet size={16} />
                        Export to Excel
                    </button>
                    <button type="button" role="menuitem" className="ds-menu-item" onClick={() => void runListExport("print")}>
                        <Printer size={16} />
                        Print report
                    </button>
                </div>
            )}
        </div>
    );

    return (
        <div className="p-3 vr-plans-page" style={{ minHeight: "100%", background: "#f7f9fc", overflowY: "auto" }}>
            <div className="d-flex justify-content-between align-items-start mb-3">
                <div><h5 className="mb-1">Contracts</h5></div>
                <div className="d-flex gap-2 align-items-center">
                    {exportMenu}
                    <button type="button" className="ds-btn ds-btn-primary" onClick={openAdd} disabled={loading || saving}>
                        <Plus size={16} />
                        Add
                    </button>
                </div>
            </div>


            {loading && tableRows.length === 0 ? (
                <div className="text-muted py-4">Loading contracts…</div>
            ) : (
                <div className="adv-mobile-table">
                    <AdvancedTable
                        columns={columns}
                        dataArray={contractsPaging.pageRows}
                        enableSearch
                        triggerPaging={contractsPaging.onSearch}
                        hidePager
                        minRows={0}
                        showPagination={false}
                        recordCount={contractsPaging.total}
                        pageSize={contractsPaging.pageSize}
                        currentPage={contractsPaging.page}
                        isFilterOptionOneRow
                        // shows 10 rows; bigger pages scroll inside the table
                        maxHeight="500px"
                    />
                    <Pagination
                        page={contractsPaging.page}
                        pageSize={contractsPaging.pageSize}
                        total={contractsPaging.total}
                        onPageChange={contractsPaging.setPage}
                        onPageSizeChange={changeContractsPageSize}
                        pageSizes={[10, 25, 50, 100]}
                    />
                </div>
            )}

            <ModalComp
                modal={!!toDelete}
                modalTitle="Delete contract?"
                modalBody={(
                    <>
                        <p className="mb-0">
                            <strong>{toDelete?.contractDraft?.ContractReference || toDelete?.plan?.planName || "This contract"}</strong>{" "}
                            and its plan will be deleted. This can't be undone.
                        </p>
                        <div className="picker-modal-footer">
                            <button type="button" className="ds-btn ds-btn-secondary" onClick={() => setToDelete(null)}>Cancel</button>
                            <button type="button" className="ds-btn ds-btn-danger" onClick={() => void confirmDelete()}>Delete</button>
                        </div>
                    </>
                )}
                onClose={() => setToDelete(null)}
                hideFooterButtons
                showCloseIcon
                size="md"
            />

            {modalOpen && editingDraft && (
                <PlanEditorModal
                    open={modalOpen}
                    initialDraft={editingDraft}
                    isNew={editingDraft.recordId < 0}
                    readOnly={editingReadOnly}
                    onClose={() => {
                        setModalOpen(false);
                        setEditingDraft(null);
                        setModalValidation(EMPTY_MODAL_VALIDATION);
                    }}
                    onApply={saveContractFromModal}
                    saving={saving}
                    typeOptions={typeOptions}
                    computationTypeOptions={computationTypeOptions}
                    settlementTypeOptions={settlementTypeOptions}
                    currencyOptions={currencyOptions}
                    initialValidationErrors={modalValidation.errors}
                    initialFieldErrorsByTarget={modalValidation.fieldErrorsByTarget}
                    initialFieldErrorsByFee={modalValidation.fieldErrorsByFee}
                    initialFieldErrorsContract={modalValidation.fieldErrorsContract}
                    authAxios={authAxios}
                    contractRecords={contractRecords}
                    contractRecordsForValidation={contractRecordsForValidation}
                    clientLabelById={clientLabelById}
                    setClientLabelById={setClientLabelById}
                />
            )}
        </div>
    );
}