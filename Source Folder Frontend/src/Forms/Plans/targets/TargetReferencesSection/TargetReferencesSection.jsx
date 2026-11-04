import { useCallback, useRef, useState, useMemo, useEffect } from "react";
import { Boxes, CheckSquare, ListPlus, Layers, Package, Plus, Square, Trash2 } from "lucide-react";
import Pagination from "../../../../ui/Pagination";
import usePagedRows from "../../../../utils/usePagedRows";
import "../../styles/contractEditor.css";
import { getApiBase } from "../../../../globals";
import { mergeTargetReferencesFromPicker } from "../../../../utils/mergeTargetReferencesFromPicker";
import { buildProductGroupColumns, buildStockItemColumns } from "../../../../utils/referenceTableColumns";
import { AdvancedTable, ModalComp } from "../../../../ReusableComponents";
import { mobileActionRow, mobileDualCell, mobileLabeledRow } from "../../../../utils/mobileTableCells";
import { PICKER_SEARCH_DEBOUNCE_MS } from "../../constants/planWorkspaceConstants";
import { getProp } from "../../../../utils/planWorkspaceMappers";

const normalizePagedLookupResponse = (data) => {
    if (Array.isArray(data)) return { items: data, totalCount: data.length };
    return { items: data?.items ?? [], totalCount: Number(data?.totalCount) || 0 };
};

const seedPickerMapFromReferences = (refs, refType) => {
    const m = new Map();
    refs.filter((r) => r.referenceType === refType).forEach((r) => {
        const id = Number(refType === "StockItem" ? r.stkRecId : r.itemTypeRecId);
        if (!id) return;
        if (refType === "StockItem") {
            m.set(id, {
                STK_RECID: id,
                STK_REF: r.stkRef,
                STK_DESC: r.stkDesc,
                DBAR_BARCODE: r.dbarBarcode,
                STK_UNIT: r.stkUnit,
            });
        } else {
            m.set(id, {
                IT_RECID: id,
                IT_CODE: r.itCode,
                IT_DESC: r.itDesc,
                GRP_CODE: r.grpCode,
                GRP_DESC: r.grpDesc,
            });
        }
    });
    return m;
};

export default function TargetReferencesSection({
    target,
    onChange,
    selectMenuProps,
    authAxios,
    onNotify,
    readOnly = false,
}) {
    const [typePickerOpen, setTypePickerOpen] = useState(false);
    const [refModal, setRefModal] = useState({ open: false, refType: null, loading: false, data: [], pendingSelected: [] });
    const [refPickerPage, setRefPickerPage] = useState(1);
    const [refPickerTotal, setRefPickerTotal] = useState(0);
    const refPickerPagingRef = useRef({ page: 1, search: "" });
    const refPickerDebounceTimer = useRef(null);
    const refPickerSelectionMapRef = useRef(new Map());
    const [refPickerSelectionVersion, setRefPickerSelectionVersion] = useState(0);
    const [refPickerPageSize, setRefPickerPageSize] = useState(25);
    const [addAllLoading, setAddAllLoading] = useState(false);

    const referencesRef = useRef(target.references);
    referencesRef.current = target.references;
    const targetRef = useRef(target);
    targetRef.current = target;

    const initializedRef = useRef(new Set());
    useEffect(() => {
        if (!target?.localId) return;
        if (initializedRef.current.has(target.localId)) return;
        initializedRef.current.add(target.localId);
    }, [target?.localId]);

    const productGroupRefs = useMemo(
        () => (target.references || []).filter((r) => r.referenceType === "ProductGroup"),
        [target.references]
    );
    const stockItemRefs = useMemo(
        () => (target.references || []).filter((r) => r.referenceType === "StockItem"),
        [target.references]
    );

    const productGroupPaging = usePagedRows(
        productGroupRefs,
        (r) => [r.itCode, r.itDesc, r.label].filter(Boolean).join(" ")
    );
    const stockItemPaging = usePagedRows(
        stockItemRefs,
        (r) => [r.stkRef, r.stkDesc, r.dbarBarcode, r.stkUnit, r.label].filter(Boolean).join(" ")
    );

    const loadRefPickerPage = useCallback(async (page, search, refType, take = refPickerPageSize) => {
        if (!refType) return { items: [], totalCount: 0 };
        setRefModal((prev) => ({ ...prev, loading: true }));
        try {
            const skip = (page - 1) * take;
            const endpoint = refType === "StockItem"
                ? `${getApiBase()}/CVRLookups/stock-items`
                : `${getApiBase()}/CVRLookups/product-groups`;
            const q = new URLSearchParams({ skip: String(skip), take: String(take) });
            if (search) q.set("search", search);
            const res = await authAxios.get(`${endpoint}?${q}`);
            const data = res.data;
            const { items, totalCount } = normalizePagedLookupResponse(data);
            setRefModal((prev) => ({ ...prev, loading: false, data: items }));
            setRefPickerTotal(totalCount);
            setRefPickerPage(page);
            refPickerPagingRef.current = { page, search };
            return { items, totalCount };
        } catch (err) {
            console.error('loadRefPickerPage error', err);
            setRefModal((prev) => ({ ...prev, open: false, loading: false }));
            onNotify?.("error", "Failed to load lookup data");
            return { items: [], totalCount: 0 };
        }
    }, [authAxios, onNotify, refPickerPageSize]);

    const openRefModal = useCallback(async (refType) => {
        setTypePickerOpen(false);
        const alreadySelected = (target.references || [])
            .filter((r) => r.referenceType === refType)
            .map((r) => Number(refType === "StockItem" ? r.stkRecId : r.itemTypeRecId))
            .filter(Boolean);

        refPickerSelectionMapRef.current = seedPickerMapFromReferences(target.references || [], refType);
        setRefPickerSelectionVersion((v) => v + 1);
        refPickerPagingRef.current = { page: 1, search: "" };
        setRefModal({ open: true, refType, loading: true, data: [], pendingSelected: alreadySelected });
        await loadRefPickerPage(1, "", refType);
    }, [target.references, loadRefPickerPage]);

    const uncheckAll = useCallback(() => {
        const m = refPickerSelectionMapRef.current;
        const idKey = refModal.refType === "StockItem" ? "STK_RECID" : "IT_RECID";
        const pageIds = new Set(
            refModal.data
                .map((row) => Number(getProp(row, idKey)))
                .filter(Boolean)
        );
        pageIds.forEach((id) => m.delete(id));
        setRefModal((prev) => ({
            ...prev,
            pendingSelected: prev.pendingSelected.filter((id) => !pageIds.has(id)),
        }));
        setRefPickerSelectionVersion((v) => v + 1);
    }, [refModal.refType, refModal.data]);

    const toggleModalRow = useCallback((id, row) => {
        setRefModal((prev) => ({
            ...prev,
            pendingSelected: prev.pendingSelected.includes(id)
                ? prev.pendingSelected.filter((x) => x !== id)
                : [...prev.pendingSelected, id],
        }));
        const m = refPickerSelectionMapRef.current;
        if (m.has(id)) m.delete(id);
        else if (row) m.set(id, row);
        setRefPickerSelectionVersion((v) => v + 1);
    }, []);

    const sortAndMergeReferences = (mergedOfType, otherRefs) => {
        const newItems = mergedOfType.filter((r) => r.targetReferenceId == null);
        const existingItems = mergedOfType.filter((r) => r.targetReferenceId != null);
        const sorted = [...newItems, ...existingItems];
        const productGroups = [
            ...sorted.filter((r) => r.referenceType === "ProductGroup"),
            ...otherRefs.filter((r) => r.referenceType === "ProductGroup"),
        ];
        const stockItems = [
            ...sorted.filter((r) => r.referenceType === "StockItem"),
            ...otherRefs.filter((r) => r.referenceType === "StockItem"),
        ];
        return [...productGroups, ...stockItems];
    };

    const confirmModalSelection = () => {
        const refType = refModal.refType;
        if (!refType) return;
        const existingOfType = (target.references || []).filter((r) => r.referenceType === refType);
        const newRefs = mergeTargetReferencesFromPicker({
            refType,
            pendingSelectedIds: refModal.pendingSelected,
            lookupRows: [...refPickerSelectionMapRef.current.values()],
            existingOfType,
            getProp,
        });
        const otherRefs = (target.references || []).filter((r) => r.referenceType !== refType);
        onChange({
            ...target,
            references: sortAndMergeReferences(newRefs, otherRefs),
        });
        refPickerSelectionMapRef.current = new Map();
        setRefModal((prev) => ({ ...prev, open: false }));
    };

    const removeReferenceRow = useCallback((ref) => {
        const t = targetRef.current;
        onChange({
            ...t,
            references: (referencesRef.current || []).filter((r) => {
                if (ref.targetReferenceId != null && r.targetReferenceId != null) {
                    return r.targetReferenceId !== ref.targetReferenceId;
                }
                if (r.referenceType !== ref.referenceType) return true;
                return ref.referenceType === "StockItem"
                    ? Number(r.stkRecId) !== Number(ref.stkRecId)
                    : Number(r.itemTypeRecId) !== Number(ref.itemTypeRecId);
            }),
        });
    }, [onChange]);

    const removeAllOfType = useCallback((refType) => {
        const t = targetRef.current;
        onChange({
            ...t,
            references: (referencesRef.current || []).filter((r) => r.referenceType !== refType),
        });
    }, [onChange]);

    const handleRefPickerTriggerPaging = useCallback((searchValue, _f, _s, counter) => {
        const refType = refModal.refType;
        if (!refType) return;
        if (refPickerDebounceTimer.current) clearTimeout(refPickerDebounceTimer.current);
        refPickerDebounceTimer.current = setTimeout(() => {
            const s = String(searchValue ?? "").trim();
            const prev = refPickerPagingRef.current;
            let page = s !== prev.search ? 1 : counter ? Math.max(1, prev.page + counter) : 1;
            void loadRefPickerPage(page, s, refType);
        }, PICKER_SEARCH_DEBOUNCE_MS);
    }, [refModal.refType, loadRefPickerPage]);

    const handleAddAll = useCallback(async () => {
        const refType = refModal.refType;
        if (!refType || addAllLoading) return;
        setAddAllLoading(true);
        try {
            const endpoint = refType === "StockItem"
                ? `${getApiBase()}/CVRLookups/stock-items/all`
                : `${getApiBase()}/CVRLookups/product-groups/all`;
            const search = refPickerPagingRef.current.search ?? "";
            const res = await authAxios.get(search ? `${endpoint}?search=${encodeURIComponent(search)}` : endpoint);
            const allRows = Array.isArray(res.data) ? res.data : (res.data?.items ?? []);
            const idKey = refType === "StockItem" ? "STK_RECID" : "IT_RECID";

            const t = targetRef.current;
            const existingOfType = (t.references || []).filter((r) => r.referenceType === refType);
            const ids = new Set(existingOfType
                .map((r) => Number(refType === "StockItem" ? r.stkRecId : r.itemTypeRecId))
                .filter(Boolean));
            allRows.forEach((row) => { const id = Number(getProp(row, idKey)); if (id) ids.add(id); });

            const newRefs = mergeTargetReferencesFromPicker({
                refType,
                pendingSelectedIds: [...ids],
                lookupRows: allRows,
                existingOfType,
                getProp,
            });
            const otherRefs = (t.references || []).filter((r) => r.referenceType !== refType);
            onChange({ ...t, references: sortAndMergeReferences(newRefs, otherRefs) });
            refPickerSelectionMapRef.current = new Map();
            setRefModal((prev) => ({ ...prev, open: false }));
        } catch {
            onNotify?.("error", `Failed to load all ${refType === "StockItem" ? "items" : "categories"}`);
        } finally {
            setAddAllLoading(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authAxios, refModal.refType, addAllLoading, onChange, onNotify]);

    const checkAllOnPage = useCallback(() => {
        const m = refPickerSelectionMapRef.current;
        const idKey = refModal.refType === "StockItem" ? "STK_RECID" : "IT_RECID";
        setRefModal((prev) => {
            const pageIds = [];
            prev.data.forEach((row) => {
                const id = Number(getProp(row, idKey));
                if (!id) return;
                pageIds.push(id);
                m.set(id, row);
            });
            return {
                ...prev,
                pendingSelected: [...new Set([...prev.pendingSelected, ...pageIds])],
            };
        });
        setRefPickerSelectionVersion((v) => v + 1);
    }, [refModal.refType]);

    const productGroupColumns = useMemo(
        () => buildProductGroupColumns({ onRemove: removeReferenceRow }),
        [removeReferenceRow]
    );
    const stockItemColumns = useMemo(
        () => buildStockItemColumns({ onRemove: removeReferenceRow }),
        [removeReferenceRow]
    );

    const refType = refModal.refType;
    const idKey = refType === "StockItem" ? "STK_RECID" : "IT_RECID";
    const pendingSet = useMemo(() => new Set(refModal.pendingSelected), [refModal.pendingSelected]);

    const pickerColumns = useMemo(() => {
        if (!refType) return [];
        const checkboxCol = {
            Header: "",
            accessor: "select",
            width: 40,
            Cell: (row) => {
                const id = Number(getProp(row.original, idKey));
                const checked = pendingSet.has(id);
                return mobileActionRow(
                    <div className="d-flex justify-content-center">
                        <input
                            type="checkbox"
                            className="form-check-input m-0"
                            checked={checked}
                            onChange={() => toggleModalRow(id, row.original)}
                            onClick={(e) => e.stopPropagation()}
                            aria-label="Select row"
                        />
                    </div>
                );
            },
        };
        const labeledPickerCol = (header, accessor, opts = {}) => ({
            Header: header,
            accessor,
            ...opts,
            Cell: (r) => {
                const val = getProp(r.original, accessor) ?? "";
                return mobileDualCell(val, mobileLabeledRow(header, val));
            },
        });
        if (refType === "StockItem") {
            return [
                checkboxCol,
                labeledPickerCol("Ref", "STK_REF", { minWidth: 100 }),
                labeledPickerCol("Description", "STK_DESC", { minWidth: 180 }),
                labeledPickerCol("Barcode", "DBAR_BARCODE", { width: 130 }),
                labeledPickerCol("Unit", "STK_UNIT", { width: 72, style: { textAlign: "center" } }),
            ];
        }
        return [
            checkboxCol,
            labeledPickerCol("Category Code", "IT_CODE", { width: 110, style: { textAlign: "center" } }),
            labeledPickerCol("Category Desc", "IT_DESC", { minWidth: 200 }),
        ];
    }, [refType, pendingSet, toggleModalRow, refPickerSelectionVersion, idKey]);

    // (reference) clicking anywhere on a row selects it; the checkbox stays
    const pickerRowProps = useCallback((_state, rowInfo) => {
        if (!rowInfo?.original) return {};
        const id = Number(getProp(rowInfo.original, idKey));
        return {
            onClick: () => { if (id) toggleModalRow(id, rowInfo.original); },
            style: { cursor: "pointer", background: pendingSet.has(id) ? "var(--surface-selected)" : undefined },
        };
    }, [idKey, toggleModalRow, pendingSet]);

    return (
        <div className="mt-3">
            {productGroupRefs.length === 0 && stockItemRefs.length === 0 ? (
                // (reference) no references = every purchase counts; no need to add the whole catalogue
                <div className="ce-cond-empty mb-3">
                    <span className="ce-scope-all"><Boxes size={16} /> Applies to <strong>all items</strong>.</span>
                    {!readOnly && (
                        <button type="button" className="ds-btn ds-btn-secondary ce-btn-sm" onClick={() => setTypePickerOpen(true)}>
                            <Plus size={15} />
                            Limit to specific items
                        </button>
                    )}
                </div>
            ) : (
                <div className="ce-scope-counts mb-3">
                    {stockItemRefs.length > 0 && (
                        <span><Package size={14} /> {stockItemRefs.length.toLocaleString()} {stockItemRefs.length === 1 ? "item" : "items"}</span>
                    )}
                    {productGroupRefs.length > 0 && (
                        <span><Layers size={14} /> {productGroupRefs.length.toLocaleString()} {productGroupRefs.length === 1 ? "category" : "categories"}</span>
                    )}
                    {!readOnly && (
                        <span className="ce-scope-clear">
                            <button type="button" className="ds-btn ds-btn-secondary ce-btn-sm" onClick={() => setTypePickerOpen(true)}>
                                <Plus size={15} /> Add items
                            </button>
                            {stockItemRefs.length > 0 && (
                                <button type="button" className="ds-btn ds-btn-ghost ce-btn-sm ce-text-danger" onClick={() => removeAllOfType("StockItem")}>
                                    <Trash2 size={14} /> Remove all items
                                </button>
                            )}
                            {productGroupRefs.length > 0 && (
                                <button type="button" className="ds-btn ds-btn-ghost ce-btn-sm ce-text-danger" onClick={() => removeAllOfType("ProductGroup")}>
                                    <Trash2 size={14} /> Remove all categories
                                </button>
                            )}
                        </span>
                    )}
                </div>
            )}

            {productGroupRefs.length > 0 && (
            <div className="mb-3">
                <small className="text-muted fw-semibold d-block mb-1">Categories</small>
                {productGroupRefs.length > 0 ? (
                    <div className="adv-mobile-table">
                        <AdvancedTable
                            columns={productGroupColumns}
                            dataArray={productGroupPaging.pageRows}
                            enableSearch
                            minRows={0}
                            showPagination={false}
                            triggerPaging={productGroupPaging.onSearch}
                            hidePager
                            isFilterOptionOneRow
                            recordCount={productGroupPaging.total}
                            pageSize={productGroupPaging.pageSize}
                            currentPage={productGroupPaging.page}
                        />
                        <Pagination
                            page={productGroupPaging.page}
                            pageSize={productGroupPaging.pageSize}
                            total={productGroupPaging.total}
                            onPageChange={productGroupPaging.setPage}
                            onPageSizeChange={productGroupPaging.setPageSize}
                        />
                    </div>
                ) : (
                    null
                )}
            </div>
            )}

            {stockItemRefs.length > 0 && (
            <div className="mb-3">
                <small className="text-muted fw-semibold d-block mb-1">Stock Items</small>
                {stockItemRefs.length > 0 ? (
                    <div className="adv-mobile-table">
                        <AdvancedTable
                            columns={stockItemColumns}
                            dataArray={stockItemPaging.pageRows}
                            enableSearch
                            minRows={0}
                            showPagination={false}
                            triggerPaging={stockItemPaging.onSearch}
                            hidePager
                            isFilterOptionOneRow
                            recordCount={stockItemPaging.total}
                            pageSize={stockItemPaging.pageSize}
                            currentPage={stockItemPaging.page}
                        />
                        <Pagination
                            page={stockItemPaging.page}
                            pageSize={stockItemPaging.pageSize}
                            total={stockItemPaging.total}
                            onPageChange={stockItemPaging.setPage}
                            onPageSizeChange={stockItemPaging.setPageSize}
                        />
                    </div>
                ) : (
                    null
                )}
            </div>
            )}

            <ModalComp
                modal={typePickerOpen}
                modalTitle="Choose the type of reference to add:"
                modalBody={(
                    <div className="d-flex gap-3 py-2">
                        <button
                            type="button"
                            className="ds-btn ds-btn-secondary flex-grow-1"
                            onClick={() => openRefModal("ProductGroup")}
                        >
                            <Layers size={16} />
                            Category
                        </button>
                        <button
                            type="button"
                            className="ds-btn ds-btn-primary flex-grow-1"
                            onClick={() => openRefModal("StockItem")}
                        >
                            <Package size={16} />
                            Stock Item
                        </button>
                    </div>
                )}
                onClose={() => setTypePickerOpen(false)}
                onCloseText="Cancel"
                size="md"
            />

            <ModalComp
                modal={refModal.open}
                modalTitle={`Select ${refType === "StockItem" ? "Stock Items" : "Categories"}`}
                modalBody={(
                    <>
                        <div className="d-flex gap-3 mb-2 align-items-center">
                            <button type="button" className="ds-btn ds-btn-ghost ce-btn-sm" onClick={checkAllOnPage}>
                                <CheckSquare size={14} /> Select page
                            </button>
                            <button type="button" className="ds-btn ds-btn-ghost ce-btn-sm" onClick={uncheckAll}>
                                <Square size={14} /> Clear selection
                            </button>
                            <button
                                type="button"
                                className="ds-btn ds-btn-secondary ce-btn-sm ms-auto"
                                onClick={handleAddAll}
                                disabled={addAllLoading}
                                title={refPickerPagingRef.current.search ? "Add every result of the search" : undefined}
                            >
                                <ListPlus size={15} />
                                {addAllLoading
                                    ? "Adding…"
                                    : `Add all ${refType === "StockItem" ? "items" : "categories"}${refPickerTotal ? ` (${refPickerTotal.toLocaleString()})` : ""}`}
                            </button>
                        </div>
                        <div className="mb-2">
                            <span>
                                {refModal.pendingSelected.length} item
                                {refModal.pendingSelected.length !== 1 ? "s" : ""} selected
                            </span>
                        </div>
                        <div className="adv-mobile-table">
                            <AdvancedTable
                                columns={pickerColumns}
                                dataArray={refModal.data}
                                enableSearch
                                triggerPaging={handleRefPickerTriggerPaging}
                                hidePager
                                recordCount={refPickerTotal}
                                pageSize={refPickerPageSize}
                                currentPage={refPickerPage}
                                showPagination={false}
                                minRows={0}
                                isFilterOptionOneRow
                                getTrProps={pickerRowProps}
                                maxHeight="none"
                            />
                        </div>
                        <Pagination
                            page={refPickerPage}
                            pageSize={refPickerPageSize}
                            total={refPickerTotal}
                            onPageChange={(p) => void loadRefPickerPage(p, refPickerPagingRef.current.search, refType)}
                            onPageSizeChange={(size) => {
                                setRefPickerPageSize(size);
                                void loadRefPickerPage(1, refPickerPagingRef.current.search, refType, size);
                            }}
                            pageSizes={[25, 50, 100]}
                        />
                        <div className="picker-modal-footer">
                            <button type="button" className="ds-btn ds-btn-secondary" onClick={() => setRefModal((p) => ({ ...p, open: false }))}>
                                Cancel
                            </button>
                            <button type="button" className="ds-btn ds-btn-primary" onClick={confirmModalSelection}>
                                {refModal.pendingSelected.length
                                    ? `Apply (${refModal.pendingSelected.length.toLocaleString()} selected)`
                                    : "Apply"}
                            </button>
                        </div>
                    </>
                )}
                onClose={() => setRefModal((p) => ({ ...p, open: false }))}
                hideFooterButtons
                size="xl"
                className="picker-modal"
            />
        </div>
    );
}