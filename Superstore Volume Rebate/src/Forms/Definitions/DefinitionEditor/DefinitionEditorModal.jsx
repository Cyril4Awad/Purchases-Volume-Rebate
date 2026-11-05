import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Download, FileSpreadsheet, Plus, Save, X } from "lucide-react";
import { InputNumericComp, InputTextComponent, SelectComp } from "../../../ReusableComponents";
import SwitchComponent from "../../../ReusableComponents/SwitchComponent/SwitchComponent";
import { useToaster } from "../../../ui/toast/Toaster";
import { apiErrorMessage } from "../../../utils/apiClient";
import exportTableToExcel from "../../../utils/exportTableToExcel";
import {
    blankValues,
    changedFields,
    duplicateRowIds,
    invalidField,
    isRowEmpty,
    missingRequired,
    primaryField,
    rowState,
    withValue,
} from "./definitionRows";
import "../../../ui/ui.css";
import "./definitionEditor.css";

/*
 * Inline editor for a small definition table (flow taken from the Sales Volume Rebate
 * reference, inputs are this app's reusable components).
 *
 * Every record is an editable row; the list always ends with at most one blank row
 * for adding. The primary field (the name) drives the row: until it has a value the
 * other fields are locked, clearing it resets them, and on an existing row it marks
 * the record for deletion. Save sends every insert/update/delete in one request.
 * Unchanged values (2 → 3 → 2) don't count.
 *
 * config: { title, description, icon, exportName, fields[], load(), save(changes) }
 *   field: { key, label, type: "text" | "number" | "select" | "switch", primary,
 *            required, unique, maxLength, options, placeholder, defaultValue,
 *            validate(value) → message | null, width }
 *   load()  → [{ id, values }]
 *   save({ inserts: values[], updates: [{ id, values }], deletes: id[] }) → [{ id, values }]
 */
export default function DefinitionEditorModal({ config, onClose }) {
    const { fields } = config;
    const primary = primaryField(fields);
    const toast = useToaster();

    const [status, setStatus] = useState("loading");
    const [rows, setRows] = useState([]);
    const [originals, setOriginals] = useState(() => new Map());
    const [saving, setSaving] = useState(false);
    const [showErrors, setShowErrors] = useState(false);
    const [confirmClose, setConfirmClose] = useState(false);
    const [exportOpen, setExportOpen] = useState(false);

    const nextRid = useRef(1);
    const fieldRefs = useRef({});
    const pendingFocus = useRef(null);
    const exportRef = useRef(null);

    const makeBlank = useCallback(
        () => ({ rid: nextRid.current++, id: null, values: blankValues(fields) }),
        [fields]
    );

    const applyServerRows = useCallback((serverRows) => {
        setOriginals(new Map(serverRows.map((r) => [r.id, r.values])));
        setRows([
            ...serverRows.map((r) => ({ rid: nextRid.current++, id: r.id, values: { ...r.values } })),
            makeBlank(),
        ]);
    }, [makeBlank]);

    // ── load ────────────────────────────────────────────────────────────────
    useEffect(() => {
        let cancelled = false;
        config.load()
            .then((serverRows) => {
                if (cancelled) return;
                applyServerRows(serverRows);
                setStatus("ready");
            })
            .catch((err) => {
                if (cancelled) return;
                setStatus("error");
                toast.error(apiErrorMessage(err, `Couldn't load ${config.title.toLowerCase()}.`));
            });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── derived state ───────────────────────────────────────────────────────
    const states = useMemo(() => {
        const map = new Map();
        rows.forEach((r) => map.set(r.rid, rowState(r, originals, fields)));
        return map;
    }, [rows, originals, fields]);

    const changes = useMemo(() => {
        const inserts = [];
        const updates = [];
        const deletes = [];
        rows.forEach((r) => {
            const s = states.get(r.rid);
            if (s === "new") inserts.push(r.values);
            else if (s === "edited") updates.push({ id: r.id, values: r.values });
            else if (s === "delete") deletes.push(r.id);
        });
        return { inserts, updates, deletes, count: inserts.length + updates.length + deletes.length };
    }, [rows, states]);

    const incompleteRids = useMemo(
        () => new Set(rows.filter((r) => !isRowEmpty(r.values, fields) && missingRequired(r.values, fields).length > 0).map((r) => r.rid)),
        [rows, fields]
    );

    const duplicateRids = useMemo(() => duplicateRowIds(rows, fields), [rows, fields]);

    const invalidRows = useMemo(() => {
        const map = new Map();
        rows.forEach((r) => {
            if (isRowEmpty(r.values, fields)) return;
            const problem = invalidField(r.values, fields);
            if (problem) map.set(r.rid, problem);
        });
        return map;
    }, [rows, fields]);

    const isDirty = changes.count > 0;

    // ── focus a row's name field ────────────────────────────────────────────
    useEffect(() => {
        if (pendingFocus.current == null) return;
        const comp = fieldRefs.current[pendingFocus.current];
        pendingFocus.current = null;
        if (comp) {
            comp.focus?.();
            comp._inputRef?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
        }
    }, [rows]);

    const focusRow = (rid) => {
        pendingFocus.current = rid;
        setRows((r) => [...r]);
    };

    // ── editing ─────────────────────────────────────────────────────────────
    const updateValue = useCallback((rid, key, value) => {
        setRows((list) => list.map((r) => (r.rid === rid ? { ...r, values: withValue(r.values, key, value, fields) } : r)));
    }, [fields]);

    const handleAdd = () => {
        if (incompleteRids.size > 0) {
            setShowErrors(true);
            toast.error("Fill in the required fields before adding a new row.");
            focusRow([...incompleteRids][0]);
            return;
        }
        if (invalidRows.size > 0) {
            const [rid, problem] = [...invalidRows.entries()][0];
            setShowErrors(true);
            toast.error(problem.message);
            focusRow(rid);
            return;
        }
        const blank = rows.find((r) => states.get(r.rid) === "blank");
        if (blank) {
            toast.info("Fill in the empty row before adding another.");
            focusRow(blank.rid);
            return;
        }
        const row = makeBlank();
        pendingFocus.current = row.rid;
        setRows((list) => [...list, row]);
    };

    // ── save ────────────────────────────────────────────────────────────────
    const handleSave = async () => {
        if (saving || status !== "ready") return;

        if (incompleteRids.size > 0) {
            setShowErrors(true);
            toast.error("Fill in the required fields.");
            focusRow([...incompleteRids][0]);
            return;
        }
        if (invalidRows.size > 0) {
            const [rid, problem] = [...invalidRows.entries()][0];
            setShowErrors(true);
            toast.error(problem.message);
            focusRow(rid);
            return;
        }
        if (duplicateRids.size > 0) {
            setShowErrors(true);
            const uniqueField = fields.find((f) => f.unique);
            toast.error(`${uniqueField?.label ?? "Value"} must be unique.`);
            focusRow([...duplicateRids][0]);
            return;
        }
        if (!isDirty) {
            toast.warning("No changes to save.");
            return;
        }

        setSaving(true);
        try {
            const fresh = await config.save({
                inserts: changes.inserts,
                updates: changes.updates,
                deletes: changes.deletes,
            });
            applyServerRows(fresh);
            setShowErrors(false);
            toast.success("Saved changes successfully.");
        } catch (err) {
            toast.error(apiErrorMessage(err, "Save failed. Nothing was changed."));
        } finally {
            setSaving(false);
        }
    };

    // ── close ───────────────────────────────────────────────────────────────
    const requestClose = useCallback(() => {
        if (saving) return;
        if (isDirty) setConfirmClose(true);
        else onClose();
    }, [isDirty, saving, onClose]);

    // ── export ──────────────────────────────────────────────────────────────
    const handleExport = () => {
        setExportOpen(false);
        const saved = [...originals.values()];
        if (saved.length === 0) {
            toast.info("No records to export.");
            return;
        }
        const columns = fields.map((f) => ({ Header: f.label, accessor: f.key }));
        const data = saved.map((values) => {
            const out = {};
            fields.forEach((f) => {
                const v = values[f.key];
                out[f.key] = f.type === "select"
                    ? (f.options.find((o) => o.value === v)?.label ?? "")
                    : v;
            });
            return out;
        });
        exportTableToExcel(columns, data, config.exportName, config.exportName.slice(0, 31));
    };

    useEffect(() => {
        if (!exportOpen) return undefined;
        const onDown = (e) => {
            if (!exportRef.current?.contains(e.target)) setExportOpen(false);
        };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, [exportOpen]);

    // ── keyboard: Esc closes, Ctrl/Cmd+S saves ──────────────────────────────
    const saveRef = useRef(handleSave);
    saveRef.current = handleSave;
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === "Escape") {
                // let an open select menu close first
                if (e.target?.closest?.(".select-wrapper, [class*='-menu']")) return;
                e.preventDefault();
                if (exportOpen) setExportOpen(false);
                else if (confirmClose) setConfirmClose(false);
                else requestClose();
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
                e.preventDefault();
                if (!confirmClose) saveRef.current();
            }
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [exportOpen, confirmClose, requestClose]);

    const gridTemplate = `${fields.map((f) => f.width || "1fr").join(" ")} 76px`;
    const Icon = config.icon;
    const recordCount = [...states.values()].filter((s) => s !== "blank" && s !== "delete").length;

    // ── render ──────────────────────────────────────────────────────────────
    return (
        <div className="de-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) requestClose(); }}>
            <div className="de-dialog" role="dialog" aria-modal="true" aria-labelledby="de-title">
                <header className="de-header">
                    {Icon && <span className="de-header-icon"><Icon size={20} /></span>}
                    <div className="de-header-text">
                        <h2 id="de-title" className="de-title">{config.title}</h2>
                        {config.description && <p className="de-subtitle">{config.description}</p>}
                    </div>
                    <button type="button" className="ds-btn-icon ds-btn" onClick={requestClose} aria-label="Close">
                        <X size={18} />
                    </button>
                </header>

                <div className="de-toolbar">
                    <div className="ds-menu-anchor" ref={exportRef}>
                        <button
                            type="button"
                            className="ds-btn ds-btn-secondary"
                            aria-haspopup="menu"
                            aria-expanded={exportOpen}
                            onClick={() => setExportOpen((o) => !o)}
                            disabled={status !== "ready"}
                        >
                            <Download size={16} />
                            Export
                            <ChevronDown size={16} className={`de-chevron${exportOpen ? " is-open" : ""}`} />
                        </button>
                        {exportOpen && (
                            <div className="ds-menu" role="menu">
                                <button type="button" role="menuitem" className="ds-menu-item" onClick={handleExport} autoFocus>
                                    <FileSpreadsheet size={16} />
                                    Export to Excel
                                </button>
                            </div>
                        )}
                    </div>

                    <span className="de-toolbar-meta">
                        {status === "ready" && `${recordCount} ${recordCount === 1 ? "record" : "records"}`}
                    </span>

                    <button type="button" className="ds-btn ds-btn-primary" onClick={handleAdd} disabled={status !== "ready"}>
                        <Plus size={16} />
                        Add
                    </button>
                </div>

                <div className="de-body">
                    {status === "loading" && <div className="de-message">Loading…</div>}
                    {status === "error" && <div className="de-message">Records could not be loaded. Close and try again.</div>}

                    {status === "ready" && (
                        <div className="de-list" style={{ "--de-grid": gridTemplate }}>
                            {rows.map((row) => (
                                <EditorRow
                                    key={row.rid}
                                    row={row}
                                    fields={fields}
                                    state={states.get(row.rid)}
                                    original={row.id != null ? originals.get(row.id) : null}
                                    showErrors={showErrors}
                                    incomplete={incompleteRids.has(row.rid)}
                                    invalidKey={invalidRows.get(row.rid)?.field.key}
                                    primaryKey={primary.key}
                                    duplicate={duplicateRids.has(row.rid)}
                                    fieldRefs={fieldRefs}
                                    onChange={updateValue}
                                />
                            ))}
                        </div>
                    )}
                </div>

                <footer className="de-footer">
                    <span className={`de-footer-status${isDirty ? " is-dirty" : ""}`}>
                        {isDirty
                            ? `${changes.count} unsaved ${changes.count === 1 ? "change" : "changes"}`
                            : "No unsaved changes"}
                    </span>
                    <div className="de-footer-actions">
                        <button type="button" className="ds-btn ds-btn-secondary" onClick={requestClose} disabled={saving}>
                            Close
                        </button>
                        <button type="button" className="ds-btn ds-btn-success" onClick={handleSave} disabled={saving || status !== "ready"}>
                            <Save size={16} />
                            {saving ? "Saving…" : "Save"}
                        </button>
                    </div>
                </footer>

                {confirmClose && (
                    <div className="de-confirm-scrim">
                        <div className="de-confirm" role="alertdialog" aria-modal="true" aria-labelledby="de-confirm-title">
                            <h3 id="de-confirm-title" className="de-confirm-title">Discard changes?</h3>
                            <p className="de-confirm-text">
                                You have {changes.count} unsaved {changes.count === 1 ? "change" : "changes"}. Closing now discards {changes.count === 1 ? "it" : "them"}.
                            </p>
                            <div className="de-confirm-actions">
                                <button type="button" className="ds-btn ds-btn-secondary" onClick={() => setConfirmClose(false)} autoFocus>
                                    Keep editing
                                </button>
                                <button type="button" className="ds-btn ds-btn-danger" onClick={onClose}>
                                    Discard
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

const STATE_BADGE = {
    new: { cls: "is-new", label: "New" },
    edited: { cls: "is-edited", label: "Edited" },
    delete: { cls: "is-delete", label: "Delete" },
};

const selectMenuProps = {
    menuPortalTarget: typeof document !== "undefined" ? document.body : undefined,
    menuPosition: "fixed",
    styles: { menuPortal: (base) => ({ ...base, zIndex: 10050 }) },
};

const fieldLabel = (f) => (
    f.required ? <>{f.label} <span className="required">*</span></> : f.label
);

function EditorRow({ row, fields, state, original, showErrors, incomplete, invalidKey, primaryKey, duplicate, fieldRefs, onChange }) {
    const locked = String(row.values[primaryKey] ?? "").trim() === "";
    const badge = STATE_BADGE[state];
    const changed = state === "edited" ? changedFields(row.values, original, fields) : null;

    return (
        <div className={`de-row is-${state}`} role="row">
            {fields.map((f) => {
                const value = row.values[f.key];
                const empty = f.type !== "switch" && String(value ?? "").trim() === "";
                const invalid = showErrors && (
                    (incomplete && f.required && empty) || (duplicate && f.unique) || invalidKey === f.key
                );
                // Everything but the name waits until the row has a name.
                const disabled = locked && f.key !== primaryKey;
                // A deleted row shows what it held in its (now empty) name label.
                const label = state === "delete" && original && f.key === primaryKey
                    ? <>{f.label}: <s>{displayValue(f, original[f.key])}</s></>
                    : fieldLabel(f);
                const setRef = f.key === primaryKey
                    ? (comp) => {
                        if (comp) fieldRefs.current[row.rid] = comp;
                        else delete fieldRefs.current[row.rid];
                    }
                    : undefined;

                return (
                    <div
                        key={f.key}
                        className={`de-cell de-cell--comp${f.type === "switch" ? " is-center" : ""}${changed?.has(f.key) ? " is-changed" : ""}${invalid ? " is-invalid" : ""}`}
                    >
                        {f.type === "text" && (
                            <InputTextComponent
                                ref={setRef}
                                name={f.key}
                                value={value ?? ""}
                                placeholder={label}
                                maxLength={f.maxLength}
                                disabled={disabled}
                                className={invalid ? "alert-danger" : ""}
                                handleChange={(v) => onChange(row.rid, f.key, v)}
                            />
                        )}

                        {f.type === "number" && (
                            <InputNumericComp
                                name={f.key}
                                value={value ?? ""}
                                placeholder={label}
                                noDecimal
                                maxLength={f.maxLength ?? 6}
                                disabled={disabled}
                                className={invalid ? "alert-danger" : ""}
                                handleChange={(v) => onChange(row.rid, f.key, String(v ?? "").replace(/\D/g, ""))}
                            />
                        )}

                        {f.type === "select" && (
                            <div className={invalid ? "de-select-invalid" : undefined}>
                                <SelectComp
                                    name={f.key}
                                    value={f.options.find((o) => o.value === value) ?? null}
                                    options={f.options}
                                    placeholder={label}
                                    disabled={disabled}
                                    onChange={(opt) => onChange(row.rid, f.key, opt?.value ?? "")}
                                    {...selectMenuProps}
                                />
                            </div>
                        )}

                        {f.type === "switch" && (
                            <div className="de-switch" title={f.label}>
                                <SwitchComponent
                                    name={f.key}
                                    checked={!!value}
                                    label={f.label}
                                    disabled={disabled}
                                    onSwitchChange={(checked) => onChange(row.rid, f.key, checked)}
                                />
                            </div>
                        )}
                    </div>
                );
            })}

            <div className="de-cell de-cell-status">
                {badge && <span className={`ds-badge ${badge.cls}`} title={state === "delete" ? "Cleared, deleted on save" : undefined}>{badge.label}</span>}
            </div>
        </div>
    );
}

function displayValue(field, value) {
    if (field.type === "select") return field.options.find((o) => o.value === value)?.label ?? "";
    return String(value ?? "");
}
