import { useContext, useEffect, useMemo, useRef, useState, useCallback } from "react";
import "../../ui/ui.css";
import "./styles/contractEditor.css";
import { Plus, Save } from "lucide-react";
import axios from "axios";
import { getApiBase } from "../../globals";
import { AuthContext } from "../../ContextProvider/AuthContext";
import {
    fetchAndMapContracts,
    mergeContractRecordsForValidation,
    upsertContractInRecords,
} from "../../utils/contractWorkspaceMappers";
import { AdvancedTable } from "../../ReusableComponents";
import { useToaster } from "../../ui/toast/Toaster";
import { triggerSessionExpired } from "../../utils/sessionExpired";
import { updateTokenFromResponse } from "../../utils/updateTokenFromResponse";
import PlanEditorModal from "./editor/PlanEditorModal/PlanEditorModal";
import {
    normalizePlanDraft,
    validatePlanDraft,
} from "../../utils/planWorkspaceValidation";
import {
    contractNeedsPersist,
    persistPlanContract,
} from "./utils/persistPlanContract";
import useUnsavedChangesBlocker from "../../CustomHooks/useUnsavedChangesBlocker";
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

const stripUiFields = (draft) => {
    if (!draft) return draft;
    return {
        ...draft,
        targets: (draft.targets || []).map(({ referenceType, ...rest }) => rest),
    };
};

const EMPTY_MODAL_VALIDATION = {
    errors: [],
    fieldErrorsByTarget: {},
    fieldErrorsByFee: {},
    fieldErrorsContract: {},
};

const getErrMsg = (err) => {
    const raw =
        err?.response?.data?.error
        ?? err?.response?.data?.message
        ?? (typeof err?.response?.data === "string" ? err.response.data : null)
        ?? err?.message
        ?? "An unexpected error occurred";
    if (raw != null && typeof raw === "object") {
        return JSON.stringify(raw);
    }
    return String(raw);
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

    const isDirty = useMemo(
        () => records.some((r) => ["new", "modified", "deleted"].includes(r._status)),
        [records]
    );
    const { discardModal } = useUnsavedChangesBlocker(isDirty);

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

    const handleModalApply = (draft) => {
        const normalized = normalizePlanDraft(draft, currencyOptions);
        const {
            valid,
            errors,
            fieldErrorsByTarget,
            fieldErrorsByFee,
            fieldErrorsContract,
        } = validatePlanDraft(normalized, { usdRate, currencyOpts: currencyOptions, settlementTypeOptions });
        if (!valid) {
            setEditingDraft(normalized);
            setModalValidation({
                errors,
                fieldErrorsByTarget: fieldErrorsByTarget || {},
                fieldErrorsByFee: fieldErrorsByFee || {},
                fieldErrorsContract: fieldErrorsContract || {},
            });
            setModalOpen(true);
            return;
        }
        const cd = normalized.contractDraft;
        let planContractId = normalized.planContractId ?? null;
        if (cd && !cd._isNew && cd.ContractID && !String(cd.ContractID).startsWith("new_")) {
            const n = Number(cd.ContractID);
            if (Number.isFinite(n) && n > 0) planContractId = n;
        }
        const withContract = { ...normalized, planContractId };

        const exists = records.some((r) => r.recordId === withContract.recordId);
        if (exists) {
            setRecords((prev) =>
                prev.map((r) => {
                    if (r.recordId !== withContract.recordId) return r;
                    const prevNormalized = stripUiFields(normalizePlanDraft(r, currencyOptions));
                    const nextNormalized = stripUiFields(normalizePlanDraft(withContract, currencyOptions));
                    const actuallyChanged = JSON.stringify(prevNormalized) !== JSON.stringify(nextNormalized);
                    return {
                        ...withContract,
                        _status: r._status === "new" ? "new" : actuallyChanged ? "modified" : r._status,
                    };
                })
            );

            const prevJson = JSON.stringify(stripUiFields(normalizePlanDraft(
                records.find((r) => r.recordId === withContract.recordId),
                currencyOptions
            )));
            const nextJson = JSON.stringify(stripUiFields(normalizePlanDraft(withContract, currencyOptions)));
            if (prevJson !== nextJson) showNotification("success", "Contract updated");
        } else {
            setRecords((prev) => [...prev, { ...withContract, _status: "new" }]);
            showNotification("success", "Contract added");
        }
        setModalOpen(false);
        setEditingDraft(null);
        setModalValidation(EMPTY_MODAL_VALIDATION);
    };

    const handleDelete = useCallback((recordId) => {
        const row = records.find((r) => r.recordId === recordId);
        if (!row) return;
        if (isContractLocked(row)) {
            showNotification("error", "Contract locked", "This contract cannot be deleted after computation save.");
            return;
        }
        if (row._status === "new") {
            setRecords((prev) => prev.filter((r) => r.recordId !== recordId));
        } else {
            setRecords((prev) =>
                prev.map((r) => (r.recordId === recordId ? { ...r, _status: "deleted" } : r))
            );
        }
        showNotification("success", "Contract marked for deletion");
    }, [records, showNotification, isContractLocked]);

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

    const handleSave = async () => {
        const staged = records.filter((r) => r._status === "new" || r._status === "modified");
        for (const row of staged) {
            const normalized = normalizePlanDraft(row, currencyOptions);
            const {
                valid,
                errors,
                fieldErrorsByTarget,
                fieldErrorsByFee,
                fieldErrorsContract,
            } = validatePlanDraft(normalized, { usdRate, currencyOpts: currencyOptions, settlementTypeOptions });
            if (!valid) {
                setEditingDraft(cloneDraft(normalized));
                setModalValidation({
                    errors,
                    fieldErrorsByTarget: fieldErrorsByTarget || {},
                    fieldErrorsByFee: fieldErrorsByFee || {},
                    fieldErrorsContract: fieldErrorsContract || {},
                });
                setModalOpen(true);
                return;
            }
        }

        const deletedPlanIds = records
            .filter((r) => r._status === "deleted" && r.recordId > 0)
            .map((r) => r.recordId);

        if (!staged.length && !deletedPlanIds.length) {
            showNotification("error", "No changes detected");
            return;
        }

        setLoading(true);
        let recordsSnapshot = [...contractRecords];
        const preparedById = new Map();
        try {

            for (const row of staged) {
                const prepared = await prepareDraftForSave(row, recordsSnapshot);
                preparedById.set(row.recordId, prepared);
                if (prepared.contractDraft)
                    recordsSnapshot = upsertContractInRecords(recordsSnapshot, prepared.contractDraft);
            }

            const newPlans = records
                .filter((r) => r._status === "new")
                .map((r) => mapDraftToPayload(preparedById.get(r.recordId) || r));
            const modifiedPlans = records
                .filter((r) => r._status === "modified")
                .map((r) => mapDraftToPayload(preparedById.get(r.recordId) || r));

            await authAxios.post(`${getApiBase()}/CVRPlanWorkspace/bulk-save`, {
                newPlans, modifiedPlans, deletedPlanIds,
            });

            workspaceCache.invalidate();
            const refreshed = await fetchData();
            if (refreshed) {
                showNotification("success", "Saved successfully");
            } else {
                // the save went through; only the reload failed. Saving again from this
                // stale list would create the new contracts / plans a second time.
                showNotification("warning", "Saved, but the list couldn't be reloaded", "Refresh the page before making more changes.");
            }
        } catch (e) {
            workspaceCache.invalidate();
            // Contracts are created before the plans are bulk-saved. If a later step failed,
            // keep the ids of the contracts that were created, otherwise the next Save would
            // create them again and fail on the unique contract reference.
            if (preparedById.size) {
                setRecords((prev) => prev.map((r) => {
                    const prepared = preparedById.get(r.recordId);
                    return prepared
                        ? { ...r, ...prepared, recordId: r.recordId, _status: r._status }
                        : r;
                }));
                setContractRecords(recordsSnapshot);
            }
            showNotification("error", "Save failed", getErrMsg(e));
        } finally {
            setLoading(false);
        }
    };

    const columns = useMemo(
        () => getPlanWorkspaceTableColumns({
            includeActions: true,
            openEdit,
            handleDelete,
            isContractLocked,
        }),
        [openEdit, handleDelete, isContractLocked]
    );

    return (
        <div className="p-3 vr-plans-page" style={{ minHeight: "100%", background: "#f7f9fc", overflowY: "auto" }}>
            {discardModal}
            <div className="d-flex justify-content-between align-items-start mb-3">
                <div><h5 className="mb-1">Contracts</h5></div>
                <div className="d-flex gap-2 align-items-center">
                    <button type="button" className="ds-btn ds-btn-primary" onClick={openAdd} disabled={loading}>
                        <Plus size={16} />
                        Add
                    </button>
                    <button type="button" className="ds-btn ds-btn-success" onClick={handleSave} disabled={loading}>
                        <Save size={16} />
                        {loading ? "Loading…" : "Save"}
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
                    onApply={handleModalApply}
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