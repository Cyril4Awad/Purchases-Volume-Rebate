import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "../../../ui/ui.css";
import "../../Plans/styles/contractEditor.css";
import { CheckSquare, ListPlus, Plus, Search, Square, Trash2 } from "lucide-react";
import { AdvancedTable, InputTextComponent, ModalComp } from "../../../ReusableComponents";
import Pagination from "../../../ui/Pagination";
import usePagedRows from "../../../utils/usePagedRows";
import {
    buildPickerCheckboxColumn,
    mapClientFieldColumns,
} from "../../../utils/clientPickerTableColumns";
import { mobileActionRow, mobileDualCell, mobileLabeledRow } from "../../../utils/mobileTableCells";
import {
    PICKER_SEARCH_DEBOUNCE_MS,
    mergeSubClientsSelection,
    mapApiClientDtoToPickerRow,
    normalizePagedClientsResponse,
    normalizeClientIdValue,
    getClientsApi,
} from "../../../utils/contractWorkspaceMappers";

export default function ContractClientsSection({
    draft,
    onChange,
    authAxios,
    clientLabelById,
    setClientLabelById,
    onValidationError,
    validationAttempted,
    readOnly = false,
}) {
    const [missingClient, setMissingClient] = useState(false);
    const [mainClientModalOpen, setMainClientModalOpen] = useState(false);
    const [subClientsModalOpen, setSubClientsModalOpen] = useState(false);
    const [mainClientPickerSelectedIds, setMainClientPickerSelectedIds] = useState([]);
    const [mainPickerRows, setMainPickerRows] = useState([]);
    const [mainPickerTotal, setMainPickerTotal] = useState(0);
    const [mainPickerPage, setMainPickerPage] = useState(1);
    const mainPickerPagingRef = useRef({ page: 1, search: "" });
    const mainPickerDebounceTimer = useRef(null);
    const [subPickerRows, setSubPickerRows] = useState([]);
    const [subPickerTotal, setSubPickerTotal] = useState(0);
    const [subPickerPage, setSubPickerPage] = useState(1);
    const subPickerPagingRef = useRef({ page: 1, search: "" });
    const subPickerDebounceTimer = useRef(null);
    const subClientsPickerMapRef = useRef(new Map());
    const [subClientsPickerVersion, setSubClientsPickerVersion] = useState(0);
    const [mainPickerPageSize, setMainPickerPageSize] = useState(25);
    const [subPickerPageSize, setSubPickerPageSize] = useState(25);
    const [addAllSubLoading, setAddAllSubLoading] = useState(false);

    // Keep a ref to latest onChange/setClientLabelById for use in auto-apply
    const onChangeRef = useRef(onChange);
    const setClientLabelByIdRef = useRef(setClientLabelById);
    const draftRef = useRef(draft);
    useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
    useEffect(() => { setClientLabelByIdRef.current = setClientLabelById; }, [setClientLabelById]);
    useEffect(() => { draftRef.current = draft; }, [draft]);

    const checkAllSubOnPage = useCallback(() => {
        const m = subClientsPickerMapRef.current;
        subPickerRows.forEach((row) => {
            const id = normalizeClientIdValue(row.clRecId ?? row.value);
            if (id == null) return;
            m.set(id, {
                value: id,
                label: row.label ?? "",
                code: row.code != null && String(row.code).length ? String(row.code) : String(id),
            });
        });
        setSubClientsPickerVersion((v) => v + 1);
    }, [subPickerRows]);

    const uncheckAllSub = useCallback(() => {
        subClientsPickerMapRef.current = new Map();
        setSubClientsPickerVersion((v) => v + 1);
    }, []);

    const toggleSubClientPickerRow = useCallback((row) => {
        const id = normalizeClientIdValue(row.clRecId ?? row.value);
        if (id == null) return;
        const m = subClientsPickerMapRef.current;
        if (m.has(id)) m.delete(id);
        else {
            m.set(id, { value: id, label: row.label ?? "", code: row.code ?? String(id) });
        }
        setSubClientsPickerVersion((v) => v + 1);
    }, []);

    const applySubClientsFromPicker = useCallback(() => {
        const pickedMap = subClientsPickerMapRef.current;
        const pickedIds = new Set(
            [...pickedMap.keys()].map(normalizeClientIdValue).filter((id) => id != null)
        );
        const mainVal = normalizeClientIdValue(draft.ClientID?.value);

        const kept = draft.SubClients.filter((sc) => {
            const id = normalizeClientIdValue(sc.ClientID?.value);
            return id != null && pickedIds.has(id);
        });

        const keptIds = new Set(
            kept.map((sc) => normalizeClientIdValue(sc.ClientID?.value)).filter(Boolean)
        );

        const toAdd = [...pickedMap.values()].filter((o) => {
            const id = normalizeClientIdValue(o?.value);
            return id != null && !keptIds.has(id) && id !== mainVal;
        });

        const { next } = mergeSubClientsSelection({ ...draft, SubClients: kept }, toAdd);

        setClientLabelById((prev) => {
            const updated = { ...prev };
            [...pickedMap.values()].forEach((o) => {
                const cid = normalizeClientIdValue(o.value);
                if (cid != null) updated[cid] = { ...o, value: cid };
            });
            return updated;
        });
        onChange({ ...draft, SubClients: next });
        setSubClientsModalOpen(false);
        subClientsPickerMapRef.current = new Map();
    }, [draft, onChange, setClientLabelById]);

    const loadMainPickerPage = useCallback(async (page, search, take = mainPickerPageSize) => {
        try {
            const skip = (page - 1) * take;
            const { data } = await authAxios.get(getClientsApi(), {
                params: { skip, take, search: search || undefined },
            });
            const { items, totalCount } = normalizePagedClientsResponse(data);
            setMainPickerRows((items || []).map(mapApiClientDtoToPickerRow));
            setMainPickerTotal(totalCount);
            setMainPickerPage(page);
            mainPickerPagingRef.current = { page, search };
        } catch (e) {
            onValidationError?.(`Failed to load suppliers: ${e.message}`);
        }
    }, [authAxios, onValidationError, mainPickerPageSize]);

    const loadSubPickerPage = useCallback(async (page, search, excludeCode, take = subPickerPageSize) => {
        try {
            const skip = (page - 1) * take;
            const params = {
                skip,
                take,
                search: search || undefined,
            };
            const exclude = normalizeClientIdValue(excludeCode);
            if (exclude) params.excludeSupCode = exclude;
            const { data } = await authAxios.get(getClientsApi(), { params });
            const { items, totalCount } = normalizePagedClientsResponse(data);
            setSubPickerRows((items || []).map(mapApiClientDtoToPickerRow));
            setSubPickerTotal(totalCount);
            setSubPickerPage(page);
            subPickerPagingRef.current = { page, search };
        } catch (e) {
            onValidationError?.(`Failed to load suppliers: ${e.message}`);
        }
    }, [authAxios, onValidationError, subPickerPageSize]);

    useEffect(() => {
        if (!mainClientModalOpen) return;
        setMainClientPickerSelectedIds(
            draft.ClientID?.value != null ? [draft.ClientID.value] : []
        );
    }, [mainClientModalOpen, draft.ClientID]);

    useEffect(() => {
        if (!mainClientModalOpen) return;
        mainPickerPagingRef.current = { page: 1, search: "" };
        void loadMainPickerPage(1, "");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mainClientModalOpen]);

    useEffect(() => {
        if (!subClientsModalOpen) return;
        const m = new Map();
        draft.SubClients.forEach((sc) => {
            const o = sc.ClientID;
            const id = normalizeClientIdValue(o?.value);
            if (id != null) {
                m.set(id, {
                    value: id,
                    label: o.label ?? "",
                    code: o.code != null && String(o.code).length ? String(o.code) : String(id),
                });
            }
        });
        subClientsPickerMapRef.current = m;
        setSubClientsPickerVersion((v) => v + 1);
        subPickerPagingRef.current = { page: 1, search: "" };
        void loadSubPickerPage(1, "", draft.ClientID?.value);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [subClientsModalOpen, draft.SubClients, draft.ClientID?.value]);

    // Every supplier matching the picker's search (the API pages by 200 at most), added
    // straight to the associated list; the master supplier is skipped.
    const handleAddAllSubClients = useCallback(async () => {
        if (addAllSubLoading) return;
        setAddAllSubLoading(true);
        try {
            const search = subPickerPagingRef.current.search || undefined;
            const excludeCode = normalizeClientIdValue(draft.ClientID?.value);
            const take = 200;
            const all = [];
            for (let skip = 0; ; skip += take) {
                const params = { skip, take, search };
                if (excludeCode) params.excludeSupCode = excludeCode;
                const { data } = await authAxios.get(getClientsApi(), { params });
                const { items, totalCount } = normalizePagedClientsResponse(data);
                all.push(...(items || []).map(mapApiClientDtoToPickerRow));
                if (!items?.length || all.length >= totalCount) break;
            }
            const opts = all
                .map((row) => {
                    const id = normalizeClientIdValue(row.clRecId ?? row.value);
                    if (id == null || id === excludeCode) return null;
                    return {
                        value: id,
                        label: row.label ?? "",
                        code: row.code != null && String(row.code).length ? String(row.code) : String(id),
                    };
                })
                .filter(Boolean);
            const { next } = mergeSubClientsSelection(draft, opts);
            setClientLabelById((prev) => {
                const updated = { ...prev };
                opts.forEach((o) => { updated[o.value] = o; });
                return updated;
            });
            onChange({ ...draft, SubClients: next });
            subClientsPickerMapRef.current = new Map();
            setSubClientsModalOpen(false);
        } catch (e) {
            onValidationError?.(`Failed to load all suppliers: ${e.message}`);
        } finally {
            setAddAllSubLoading(false);
        }
    }, [addAllSubLoading, authAxios, draft, onChange, onValidationError, setClientLabelById]);

    const handleDeleteSubClient = useCallback((id) => {
        onChange({
            ...draft,
            SubClients: draft.SubClients.filter((x) => x.ContractClientID !== id),
        });
    }, [draft, onChange]);

    // Auto-apply when a main client row is toggled — select and immediately close
    const toggleMainClientPickerRow = useCallback((row) => {
        const value = row.clRecId;
        const opt = {
            value: row.value,
            label: row.label ?? "",
            code: row.code ?? String(row.value),
        };

        setMainClientPickerSelectedIds([value]);
        setMissingClient(false);

        // Auto-apply immediately
        setClientLabelByIdRef.current((prev) => ({ ...prev, [opt.value]: opt }));
        onChangeRef.current({ ...draftRef.current, ClientID: opt });
        setMainClientModalOpen(false);
    }, []);

    const handleMainClientTriggerPaging = useCallback((searchValue, _f, _s, counter) => {
        if (mainPickerDebounceTimer.current) clearTimeout(mainPickerDebounceTimer.current);
        mainPickerDebounceTimer.current = setTimeout(() => {
            const s = String(searchValue ?? "").trim();
            const prev = mainPickerPagingRef.current;
            let page = s !== prev.search ? 1 : counter ? Math.max(1, prev.page + counter) : 1;
            void loadMainPickerPage(page, s);
        }, PICKER_SEARCH_DEBOUNCE_MS);
    }, [loadMainPickerPage]);

    const handleSubClientTriggerPaging = useCallback((searchValue, _f, _s, counter) => {
        if (subPickerDebounceTimer.current) clearTimeout(subPickerDebounceTimer.current);
        subPickerDebounceTimer.current = setTimeout(() => {
            const s = String(searchValue ?? "").trim();
            const prev = subPickerPagingRef.current;
            let page = s !== prev.search ? 1 : counter ? Math.max(1, prev.page + counter) : 1;
            void loadSubPickerPage(page, s, draft.ClientID?.value);
        }, PICKER_SEARCH_DEBOUNCE_MS);
    }, [loadSubPickerPage, draft.ClientID?.value]);

    const pickerCheckboxCol = (checked, onToggle, { isLocked } = {}) =>
        buildPickerCheckboxColumn({
            checked,
            onToggle,
            isLocked,
        });

    // Only one master supplier: no checkbox, clicking a row picks it (and closes the picker).
    const mainClientPickerColumns = useMemo(() => mapClientFieldColumns(), []);

    const mainPickerRowProps = useCallback((_state, rowInfo) => {
        if (!rowInfo?.original) return {};
        const current = mainClientPickerSelectedIds.includes(rowInfo.original.clRecId);
        return {
            onClick: () => toggleMainClientPickerRow(rowInfo.original),
            style: { cursor: "pointer", background: current ? "var(--surface-selected)" : undefined, fontWeight: current ? 600 : undefined },
            title: current ? "Current master supplier" : "Select as master supplier",
        };
    }, [mainClientPickerSelectedIds, toggleMainClientPickerRow]);

    const subClientPickerColumns = useMemo(() => [
        pickerCheckboxCol(
            (row) => {
                const id = normalizeClientIdValue(row.clRecId ?? row.value);
                return subClientsPickerMapRef.current.has(id);
            },
            toggleSubClientPickerRow,
            {
                isLocked: (row) => {
                    const id = normalizeClientIdValue(row.clRecId ?? row.value);
                    return draft.SubClients.some(
                        (sc) => normalizeClientIdValue(sc.ClientID?.value) === id
                    );
                },
            }
        ),
        ...mapClientFieldColumns(),
    ], [subClientsPickerVersion, toggleSubClientPickerRow, draft.SubClients]);

    // (reference) clicking anywhere on a row selects it; the checkbox stays
    const subPickerRowProps = useCallback((_state, rowInfo) => {
        const row = rowInfo?.original;
        if (!row) return {};
        const id = normalizeClientIdValue(row.clRecId ?? row.value);
        const locked = draft.SubClients.some((sc) => normalizeClientIdValue(sc.ClientID?.value) === id);
        const selected = subClientsPickerMapRef.current.has(id);
        return {
            onClick: (e) => {
                if (locked || e.target?.closest?.("input")) return;
                toggleSubClientPickerRow(row);
            },
            style: { cursor: locked ? "default" : "pointer", background: selected ? "var(--surface-selected)" : undefined },
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draft.SubClients, toggleSubClientPickerRow, subClientsPickerVersion]);

    const subClientsPaging = usePagedRows(
        draft.SubClients,
        (sc) => [sc.ClientID?.code, sc.ClientID?.value, sc.ClientID?.label].filter((x) => x != null).join(" ")
    );

    const clientInvalid = missingClient || (validationAttempted && !draft.ClientID);

    const subClientsColumns = useMemo(() => [
        {
            Header: "Code",
            accessor: "ClientID",
            width: 120,
            style: { textAlign: "center" },
            Cell: (row) => {
                const o = row.value;
                const code = !o ? "" : (o.code ?? o.value);
                return (
                    <div style={{ textAlign: "center" }}>
                        {mobileDualCell(code, mobileLabeledRow("Code", code))}
                    </div>
                );
            },
        },
        {
            Header: "Supplier Name",
            accessor: "ClientID",
            id: "clientName",
            minWidth: 200,
            Cell: (row) => {
                const name = row.value?.label ?? "";
                return mobileDualCell(name, mobileLabeledRow("Supplier Name", name));
            },
        },
        {
            Header: "",
            accessor: "ContractClientID",
            width: 90,
            style: { textAlign: "center" },
            Cell: (row) => !readOnly ? mobileActionRow(
                <div style={{ textAlign: "center" }}>
                    <button
                        type="button"
                        className="ds-btn ds-btn-icon"
                        onClick={() => handleDeleteSubClient(row.original.ContractClientID)}
                        aria-label="Remove supplier"
                        title="Remove supplier"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
            ) : null,
        },
    ], [handleDeleteSubClient, readOnly]);

    return (
        <>
            <div className="card border-0 shadow-sm mb-3 plan-modal-card">
                <div className="card-header bg-light border-0">
                    <strong>Suppliers</strong>
                </div>
                <div className="card-body">
                    <div style={{ maxWidth: 850 }}>
                        {/* Main client row */}
                        <div className="d-flex align-items-end gap-2 mb-3">
                            <div className="flex-grow-1">
                                <InputTextComponent
                                    name="MainClientDisplay"
                                    value={
                                        draft.ClientID
                                            ? `${draft.ClientID.code ?? draft.ClientID.value} - ${draft.ClientID.label ?? ""}`
                                            : ""
                                    }
                                    placeholder={<>Master Supplier <span className="required">*</span></>}
                                    handleChange={() => { }}
                                    handleOnblur={() => {
                                        if (!draft.ClientID) setMissingClient(true);
                                    }}
                                    className={clientInvalid ? "alert-danger" : ""}
                                    readOnly
                                />
                            </div>
                            {!readOnly && (
                                <button
                                    type="button"
                                    className="ds-btn ds-btn-secondary ce-btn-sm mb-2"
                                    style={{ whiteSpace: "nowrap" }}
                                    onClick={() => setMainClientModalOpen(true)}
                                >
                                    <Search size={14} />
                                    Select
                                </button>
                            )}
                        </div>

                        {/* Associated clients header row */}
                        <div className="d-flex justify-content-between align-items-center mb-2">
                            <small className="text-muted">Associated Suppliers</small>
                            {!readOnly && (
                                <button
                                    type="button"
                                    className="ds-btn ds-btn-secondary ce-btn-sm"
                                    onClick={() => setSubClientsModalOpen(true)}
                                >
                                    <Plus size={15} />
                                    Add suppliers
                                </button>
                            )}
                        </div>

                        {/* Sub clients table */}
                        <div className="adv-mobile-table ds-table-10">
                            <AdvancedTable
                                columns={subClientsColumns}
                                dataArray={subClientsPaging.pageRows}
                                enableSearch={draft.SubClients.length > 0}
                                triggerPaging={subClientsPaging.onSearch}
                                hidePager
                                isFilterOptionOneRow
                                minRows={0}
                                showPagination={false}
                                recordCount={subClientsPaging.total}
                                pageSize={subClientsPaging.pageSize}
                                currentPage={subClientsPaging.page}
                                getTrProps={(_state, row) =>
                                    row?.original?._isNew ? { className: "sub-client-row--new" } : {}
                                }
                            />
                        </div>
                        {draft.SubClients.length > 0 && (
                            <Pagination
                                page={subClientsPaging.page}
                                pageSize={subClientsPaging.pageSize}
                                total={subClientsPaging.total}
                                onPageChange={subClientsPaging.setPage}
                                onPageSizeChange={subClientsPaging.setPageSize}
                            />
                        )}
                    </div>
                </div>
            </div>

            {/* Main client picker modal — auto-applies on row click, Cancel only */}
            <ModalComp
                modal={mainClientModalOpen}
                modalTitle="Select Master Supplier"
                modalBody={(
                    <>
                        <div className="text-muted small mb-2">Click a supplier to select it.</div>
                        <div className="adv-mobile-table">
                            <AdvancedTable
                                columns={mainClientPickerColumns}
                                dataArray={mainPickerRows}
                                enableSearch
                                isFilterOptionOneRow
                                minRows={0}
                                showPagination={false}
                                triggerPaging={handleMainClientTriggerPaging}
                                hidePager
                                recordCount={mainPickerTotal}
                                pageSize={mainPickerPageSize}
                                currentPage={mainPickerPage}
                                getTrProps={mainPickerRowProps}
                                maxHeight="none"
                            />
                        </div>
                        <Pagination
                            page={mainPickerPage}
                            pageSize={mainPickerPageSize}
                            total={mainPickerTotal}
                            onPageChange={(p) => void loadMainPickerPage(p, mainPickerPagingRef.current.search)}
                            onPageSizeChange={(size) => {
                                setMainPickerPageSize(size);
                                void loadMainPickerPage(1, mainPickerPagingRef.current.search, size);
                            }}
                            pageSizes={[25, 50, 100]}
                        />
                        <div className="picker-modal-footer">
                            <button type="button" className="ds-btn ds-btn-secondary" onClick={() => setMainClientModalOpen(false)}>
                                Cancel
                            </button>
                        </div>
                    </>
                )}
                onClose={() => setMainClientModalOpen(false)}
                hideFooterButtons
                size="xl"
                className="picker-modal"
            />

            {/* Sub clients picker modal */}
            <ModalComp
                modal={subClientsModalOpen}
                modalTitle="Select Associated Suppliers"
                modalBody={(
                    <>
                        <div className="d-flex gap-3 mb-2 align-items-center">
                            <button type="button" className="ds-btn ds-btn-ghost ce-btn-sm" onClick={checkAllSubOnPage}>
                                <CheckSquare size={14} /> Select page
                            </button>
                            <button type="button" className="ds-btn ds-btn-ghost ce-btn-sm" onClick={uncheckAllSub}>
                                <Square size={14} /> Clear selection
                            </button>
                            <button
                                type="button"
                                className="ds-btn ds-btn-secondary ce-btn-sm ms-auto"
                                onClick={handleAddAllSubClients}
                                disabled={addAllSubLoading}
                                title={subPickerPagingRef.current.search ? "Add every supplier matching the search" : "Add every supplier"}
                            >
                                <ListPlus size={15} />
                                {addAllSubLoading
                                    ? "Adding…"
                                    : `Add all suppliers${subPickerTotal ? ` (${subPickerTotal.toLocaleString()})` : ""}`}
                            </button>
                        </div>
                        <div className="adv-mobile-table">
                            <AdvancedTable
                                columns={subClientPickerColumns}
                                dataArray={subPickerRows}
                                enableSearch
                                isFilterOptionOneRow
                                minRows={0}
                                showPagination={false}
                                triggerPaging={handleSubClientTriggerPaging}
                                hidePager
                                recordCount={subPickerTotal}
                                pageSize={subPickerPageSize}
                                currentPage={subPickerPage}
                                getTrProps={subPickerRowProps}
                                maxHeight="none"
                            />
                        </div>
                        <Pagination
                            page={subPickerPage}
                            pageSize={subPickerPageSize}
                            total={subPickerTotal}
                            onPageChange={(p) => void loadSubPickerPage(p, subPickerPagingRef.current.search, draft.ClientID?.value)}
                            onPageSizeChange={(size) => {
                                setSubPickerPageSize(size);
                                void loadSubPickerPage(1, subPickerPagingRef.current.search, draft.ClientID?.value, size);
                            }}
                            pageSizes={[25, 50, 100]}
                        />
                        <div className="picker-modal-footer">
                            <button type="button" className="ds-btn ds-btn-secondary" onClick={() => setSubClientsModalOpen(false)}>
                                Cancel
                            </button>
                            <button type="button" className="ds-btn ds-btn-primary" onClick={applySubClientsFromPicker}>
                                Apply ({subClientsPickerMapRef.current.size} selected)
                            </button>
                        </div>
                    </>
                )}
                onClose={() => setSubClientsModalOpen(false)}
                hideFooterButtons
                size="xl"
                className="picker-modal"
            />
        </>
    );
}