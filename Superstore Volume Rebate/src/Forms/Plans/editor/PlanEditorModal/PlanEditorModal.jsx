import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import moment from "moment";
import { isEqual } from "lodash";
import { AlertTriangle, ChevronDown, CircleCheck, Download, FileSpreadsheet, FlaskConical, Printer, Save } from "lucide-react";
import "../../../../ui/ui.css";
import "../../styles/contractEditor.css";
import { exportContractToExcel, printContractReport } from "../../utils/contractReport";
import { loadCompanyName } from "../../../../utils/appSettings";
import { useToaster } from "../../../../ui/toast/Toaster";

import { ModalComp } from "../../../../ReusableComponents";

import PlanFormSection from "../PlanFormSection/PlanFormSection";
import PlanContractSection from "../PlanContractSection/PlanContractSection";
import PlanFeesSection from "../PlanFeesSection/PlanFeesSection";
import PlanWorkspaceAccordion from "../../components/PlanWorkspaceAccordion/PlanWorkspaceAccordion";
import TargetListNav, { TargetSelectorBar, useTargetNavCollapsed } from "../../targets/TargetListNav/TargetListNav";
import TargetEditorPanel from "../../targets/TargetEditorPanel/TargetEditorPanel";
import PlanModalValidationAlerts, { issueSection } from "../../components/PlanModalValidationAlerts/PlanModalValidationAlerts";

import {
    normalizePlanDraft,
    normalizeRebateValueType,
    validatePlanDraft,
} from "../../../../utils/planWorkspaceValidation";

import { checkContractReferenceUnique } from "../../../../utils/checkContractReferenceUnique";
import { emptyContractForm } from "../../../../utils/contractWorkspaceMappers";
import { getApiBase } from "../../../../globals";
import {
    buildResolvedFromPlanDraft,
} from "../../../../utils/buildResolvedFromPlanDraft";
import { hydratePlanDraftCurrencies } from "../../../../utils/planWorkspaceMappers";
import { applyContractCurrencyToDraft, resolveContractCurrencyCode } from "../../../../utils/contractCurrency";
import { filterActiveSelectOptions } from "../../../../utils/definitionSelectOptions";
import { shiftResolvedForSimulation, resolveSimulationAsOf } from "../../../../utils/simulationDateShift";
import ComputationResultsPanel from "../../../Computation/ComputationResultsPanel/ComputationResultsPanel";
import { useLastAccountingGenerationDate } from "../../../Computation/hooks/useLastAccountingGenerationDate";
import { useComputationPreview } from "../../../Computation/hooks/useComputationPreview";

// @ts-ignore

import "../../styles/VRPlansWorkspace.css";
import "../../../Computation/VRComputationWorkspace.css";
import "./PlanEditorModal.css";

const EMPTY_CLIENT_IDS = [];
const SECTION_LABEL = { contract: "Contract", plan: "Plan", fees: "Fees", targets: "Targets" };

let _contractTempId = 0;

const initContractDraftIfNeeded = (draft) => {
    if (draft?.contractDraft) return draft;
    const id = `new_${Date.now()}_${_contractTempId++}`;
    return {
        ...draft,
        contractDraft: { ...emptyContractForm(), ContractID: id, _isNew: true },
    };
};

export default function PlanEditorModal({
    open,
    initialDraft,
    isNew,
    onClose,
    onApply,
    typeOptions,
    computationTypeOptions,
    settlementTypeOptions,
    currencyOptions,
    initialValidationErrors = [],
    initialFieldErrorsByTarget = {},
    initialFieldErrorsByFee = {},
    initialFieldErrorsContract = {},
    authAxios,
    contractRecords = [],
    contractRecordsForValidation,
    clientLabelById,
    setClientLabelById,
    readOnly = false,
    // true while the parent saves the contract (Save button disabled, label changes)
    saving = false,
    // Optional: pass your company name from app config / context
    companyName = "",
}) {
    const [draft, setDraft] = useState(initialDraft);
    // the draft as it was opened (after the automatic currency hydration), to tell
    // whether closing would throw away the user's changes
    const baselineRef = useRef(null);
    const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
    const [activeTargetId, setActiveTargetId] = useState(null);
    const [validationErrors, setValidationErrors] = useState([]);
    // Footer "N issues to fix" list. Once validation has run, the draft is re-validated on
    // every change so fixed issues drop off straight away (liveIssues). extraIssues are the
    // ones the validator can't see: the reference uniqueness check and one-off notices.
    const [liveIssues, setLiveIssues] = useState([]);
    const [extraIssues, setExtraIssues] = useState([]);
    const [openSignals, setOpenSignals] = useState({ plan: 0, fees: 0, targets: 0 });
    const latestDraftRef = useRef(initialDraft);
    const toast = useToaster();

    // (reference) footer list of the issues to fix
    const [issuesOpen, setIssuesOpen] = useState(false);
    const issuesRef = useRef(null);
    useEffect(() => {
        if (!issuesOpen) return undefined;
        const onDown = (e) => { if (!issuesRef.current?.contains(e.target)) setIssuesOpen(false); };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, [issuesOpen]);

    // (reference) one Export menu: Excel + printed report
    const [exportOpen, setExportOpen] = useState(false);
    const exportRef = useRef(null);
    useEffect(() => {
        if (!exportOpen) return undefined;
        const onDown = (e) => { if (!exportRef.current?.contains(e.target)) setExportOpen(false); };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, [exportOpen]);
    const [fieldErrorsByTarget, setFieldErrorsByTarget] = useState({});
    const [contractFieldErrors, setContractFieldErrors] = useState({});
    const [fieldErrorsByFee, setFieldErrorsByFee] = useState({});
    const [validationAttempted, setValidationAttempted] = useState(false);
    const [usdRate, setUsdRate] = useState(null);
    const [simulationOpen, setSimulationOpen] = useState(false);
    const [simulationModePickerOpen, setSimulationModePickerOpen] = useState(false);
    const [simulationMode, setSimulationMode] = useState("current");
    const [simulationResolved, setSimulationResolved] = useState(null);
    const [pendingSimulationResolved, setPendingSimulationResolved] = useState(null);
    const [simulationErrors, setSimulationErrors] = useState([]);
    const modalContentRef = useRef(null);
    const targetNavCollapsed = useTargetNavCollapsed(open);
    const currenciesHydratedRef = useRef(false);

    const {
        previewResults: simulationPreview,
        salesByTargetId: simulationSalesById,
        salesMetaByTargetId: simulationSalesMeta,
        loadingSales: simulationLoadingSales,
        runPreview: runSimulationPreview,
        resetPreview: resetSimulationPreview,
        fetchSalesForDraftWindows: fetchSimulationSalesForDraftWindows,
    } = useComputationPreview(authAxios, { dailyRate: usdRate });

    const { generationDate: lastAccountingGenerationDate } = useLastAccountingGenerationDate(authAxios);

    const simulationClientIds = simulationResolved?.allClientIds ?? EMPTY_CLIENT_IDS;
    const simulationAsOfDate = useMemo(() => {
        if (simulationMode === "previousYear") {
            const resolvedAsOf = resolveSimulationAsOf(
                simulationResolved,
                simulationResolved?.targets ?? [],
                -1
            );
            return resolvedAsOf
                ? moment(resolvedAsOf).format("YYYY-MM-DD")
                : moment().format("YYYY-MM-DD");
        }
        return moment().format("YYYY-MM-DD");
    }, [simulationMode, simulationResolved]);

    useEffect(() => {
        if (open && initialDraft) {
            let nextDraft = initContractDraftIfNeeded(initialDraft);
            if (currencyOptions?.length) {
                nextDraft = hydratePlanDraftCurrencies(nextDraft, currencyOptions);
                currenciesHydratedRef.current = true;
            } else {
                currenciesHydratedRef.current = false;
            }
            setDraft(nextDraft);
            baselineRef.current = nextDraft;
            setConfirmDiscardOpen(false);
            setActiveTargetId(nextDraft.targets?.[0]?.localId ?? null);
            setValidationErrors([]);
            setLiveIssues([]);
            setExtraIssues([]);
            setFieldErrorsByTarget({});
            setContractFieldErrors({});
            setFieldErrorsByFee({});
            setValidationAttempted(false);
        }
        if (!open) {
            currenciesHydratedRef.current = false;
        }
    }, [open, initialDraft]);

    useEffect(() => {
        if (!open || !currencyOptions?.length || currenciesHydratedRef.current) return;
        currenciesHydratedRef.current = true;
        if (baselineRef.current) baselineRef.current = hydratePlanDraftCurrencies(baselineRef.current, currencyOptions);
        setDraft((d) => hydratePlanDraftCurrencies(d, currencyOptions));
    }, [open, currencyOptions]);

    useEffect(() => {
        if (!open || !authAxios) return;
        let cancelled = false;
        authAxios.get(`${getApiBase()}/CVRDailyRates/current`)
            .then((res) => {
                if (cancelled) return;
                const rate = res?.data?.rate;
                setUsdRate(rate != null && Number.isFinite(Number(rate)) ? Number(rate) : null);
            })
            .catch(() => { if (!cancelled) setUsdRate(null); });
        return () => { cancelled = true; };
    }, [open, authAxios]);

    useEffect(() => {
        if (!open) return;
        const hasErrors = initialValidationErrors?.length > 0;
        const hasFieldErrors =
            Object.keys(initialFieldErrorsByTarget || {}).length > 0
            || Object.keys(initialFieldErrorsByFee || {}).length > 0
            || Object.keys(initialFieldErrorsContract || {}).length > 0;
        if (!hasErrors && !hasFieldErrors) return;

        setValidationErrors(initialValidationErrors || []);
        setFieldErrorsByTarget(initialFieldErrorsByTarget || {});
        setFieldErrorsByFee(initialFieldErrorsByFee || {});
        setContractFieldErrors(initialFieldErrorsContract || {});
        setValidationAttempted(true);
    }, [
        open,
        initialValidationErrors,
        initialFieldErrorsByTarget,
        initialFieldErrorsByFee,
        initialFieldErrorsContract,
    ]);

    // a notice stays in the list until the user changes something
    const addNotices = useCallback((messages, section = "contract") => {
        const list = (Array.isArray(messages) ? messages : [messages]).filter(Boolean);
        if (!list.length) return;
        const at = latestDraftRef.current;
        setExtraIssues((prev) => [...prev, ...list.map((message) => ({ message, section, kind: "notice", draft: at }))]);
    }, []);

    const appendValidationErrors = useCallback((messages) => {
        const list = Array.isArray(messages) ? messages : [messages];
        setValidationErrors((prev) => [...prev, ...list.filter(Boolean)]);
        addNotices(list);
    }, [addNotices]);

    const selectMenuProps = useMemo(() => ({
        menuPortalTarget: document.body,
        menuPosition: "fixed",
        menuPlacement: "auto",
        styles: {
            menuPortal: (b) => ({ ...b, zIndex: 999999 }),
            menu: (b) => ({ ...b, zIndex: 999999 }),
            menuList: (b) => ({ ...b, zIndex: 999999 }),
        },
        ...(readOnly ? { disabled: true } : {}),
    }), [readOnly]);

    useEffect(() => {
        if (!open || !readOnly) return undefined;
        document.body.classList.add("plan-editor-readonly-active");
        return () => document.body.classList.remove("plan-editor-readonly-active");
    }, [open, readOnly]);

    const activeTarget = draft?.targets?.find((t) => t.localId === activeTargetId) ?? draft?.targets?.[0];

    const contractCurrencyCode = useMemo(
        () => resolveContractCurrencyCode(draft) ?? "",
        [draft]
    );

    const visibleTypeOptions = useMemo(
        () => filterActiveSelectOptions(typeOptions, draft?.plan?.typeId),
        [typeOptions, draft?.plan?.typeId]
    );

    const visibleSettlementTypeOptions = useMemo(
        () => filterActiveSelectOptions(
            settlementTypeOptions,
            (draft?.fees ?? []).map((f) => f.settlementTypeId).concat(
                (draft?.targets ?? []).map((t) => t.settlementTypeId)
            )
        ),
        [settlementTypeOptions, draft?.fees, draft?.targets]
    );

    const visibleComputationTypeOptions = useMemo(
        () => filterActiveSelectOptions(
            computationTypeOptions,
            activeTarget?.computationTypeId
        ),
        [computationTypeOptions, activeTarget?.computationTypeId]
    );

    latestDraftRef.current = draft;

    useEffect(() => {
        if (!open || readOnly || !validationAttempted || !draft) {
            setLiveIssues([]);
            return undefined;
        }
        const handle = setTimeout(() => {
            try {
                const normalized = normalizePlanDraft(draft, currencyOptions);
                const r = validatePlanDraft(normalized, { usdRate, currencyOpts: currencyOptions, settlementTypeOptions });
                setLiveIssues(r.issues ?? (r.errors ?? []).map((message) => ({ message, section: issueSection(message).toLowerCase() })));
                setFieldErrorsByTarget(r.fieldErrorsByTarget || {});
                setFieldErrorsByFee(r.fieldErrorsByFee || {});
                setContractFieldErrors((prev) => ({
                    ...(r.fieldErrorsContract || {}),
                    // keep the uniqueness error the validator can't know about
                    ...(prev.ContractReference && typeof prev.ContractReference === "string"
                        ? { ContractReference: prev.ContractReference } : {}),
                }));
            } catch {
                // a half-typed draft must never break the editor; Apply validates again
            }
        }, 200);
        return () => clearTimeout(handle);
    }, [open, readOnly, validationAttempted, draft, currencyOptions, usdRate, settlementTypeOptions]);

    const currentRefKey = String(draft?.contractDraft?.ContractReference ?? "").trim().toLowerCase();
    const issues = useMemo(() => {
        const extras = extraIssues.filter((i) =>
            (i.kind === "reference" ? i.ref === currentRefKey : i.draft === draft)
        );
        const seen = new Set();
        return [...extras, ...liveIssues].filter((i) => {
            const k = `${i.message}|${i.targetLocalId ?? ""}|${i.feeIndex ?? ""}`;
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
        });
    }, [extraIssues, liveIssues, currentRefKey, draft]);

    // the reference was changed: its uniqueness error goes with it
    useEffect(() => {
        setContractFieldErrors((prev) => {
            if (typeof prev.ContractReference !== "string") return prev;
            if (extraIssues.some((i) => i.kind === "reference" && i.ref === currentRefKey)) return prev;
            const { ContractReference: _gone, ...rest } = prev;
            return rest;
        });
    }, [currentRefKey, extraIssues]);

    useEffect(() => { if (!issues.length) setIssuesOpen(false); }, [issues.length]);

    // Clicking an issue: open its section, select its target, then scroll to (and focus)
    // the first field marked invalid there.
    const goToIssue = useCallback((issue) => {
        setIssuesOpen(false);
        const section = issue.section ?? issueSection(issue.message).toLowerCase();
        if (section === "targets") {
            let id = issue.targetLocalId;
            if (!id && /^Each target needs a name/.test(issue.message)) {
                id = (draft?.targets ?? []).find((t) => !t.targetName?.trim())?.localId;
            }
            if (!id) {
                const name = /^Target "([^"]*)"/.exec(issue.message)?.[1];
                if (name != null) id = (draft?.targets ?? []).find((x) => (x.targetName?.trim() || "Unnamed target") === name)?.localId;
            }
            if (id) setActiveTargetId(id);
        }
        setOpenSignals((s) => ({
            plan: section !== "contract" ? s.plan + 1 : s.plan,
            fees: section === "fees" ? s.fees + 1 : s.fees,
            targets: section === "targets" ? s.targets + 1 : s.targets,
        }));
        // wait for the accordion / target panel to render
        setTimeout(() => {
            const root = modalContentRef.current;
            if (!root) return;
            const area = root.querySelector(`[data-issue-section="${section}"]`) ?? root;
            let field = null;
            if (section === "fees" && issue.feeIndex != null) {
                const rows = area.querySelectorAll("[data-fee-index]");
                const row = [...rows].find((r) => r.getAttribute("data-fee-index") === String(issue.feeIndex));
                field = row?.querySelector(".alert-danger") ?? row ?? null;
            }
            field = field ?? area.querySelector(".alert-danger, .is-invalid, [aria-invalid='true']");
            const el = field ?? area;
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            const focusable = el.matches?.("input, textarea, select, [contenteditable='true']")
                ? el
                : el.querySelector?.("input:not([type='hidden']):not([disabled]), textarea, [contenteditable='true']");
            focusable?.focus?.({ preventScroll: true });
            el.classList.add("ce-issue-flash");
            setTimeout(() => el.classList.remove("ce-issue-flash"), 1600);
        }, 320); // after the section's open animation (260ms)
    }, [draft]);

    const hasUnsavedChanges = () =>
        !readOnly && !!draft && !!baselineRef.current && !isEqual(draft, baselineRef.current);

    // Cancel / Esc: ask before throwing away changes
    const requestClose = () => {
        if (hasUnsavedChanges()) setConfirmDiscardOpen(true);
        else onClose?.();
    };

    const scrollModalToTop = () => {
        if (modalContentRef.current) {
            modalContentRef.current.scrollTop = 0;
        }
    };

    const handleContractChange = (contractDraft) => {
        const planContractId = contractDraft._isNew ? null : contractDraft.ContractID;
        setDraft((d) => applyContractCurrencyToDraft(
            { ...d, planContractId, contractDraft },
            currencyOptions
        ));
    };

    const runSimulationWithMode = useCallback(async (resolved, mode) => {
        setSimulationMode(mode);
        const yearOffset = mode === "previousYear" ? -1 : 0;
        const displayResolved = yearOffset
            ? shiftResolvedForSimulation(resolved, yearOffset)
            : resolved;
        setSimulationResolved(displayResolved);
        setSimulationOpen(true);
        setSimulationErrors([]);

        const previewOptions = { useDraftDates: true };
        if (mode === "previousYear") {
            previewOptions.yearOffset = -1;
        }

        await runSimulationPreview(resolved, previewOptions);
    }, [runSimulationPreview]);

    // (reference) adding a target requires the last one to be complete: same rules as saving,
    // limited to that target (contract and fee problems don't block it).
    const canAddTarget = useCallback(() => {
        const targets = draft?.targets ?? [];
        const last = targets[targets.length - 1];
        if (!last) return true;
        const normalized = normalizePlanDraft({ ...draft, targets: [last], fees: [] }, currencyOptions);
        const { errors, fieldErrorsByTarget: fe } =
            validatePlanDraft(normalized, { usdRate, currencyOpts: currencyOptions, settlementTypeOptions });
        const targetErrors = (errors ?? []).filter((e) => /^Target "/.test(e) || /^Each target/.test(e));
        if (!targetErrors.length) return true;
        setValidationAttempted(true);
        setFieldErrorsByTarget((prev) => ({ ...prev, ...(fe || {}) }));
        setActiveTargetId(last.localId);
        const notice = `Complete "${last.targetName?.trim() || "the current target"}" before adding another target.`;
        setValidationErrors([notice, ...targetErrors]);
        setExtraIssues((prev) => [...prev.filter((i) => i.kind !== "notice"), { message: notice, section: "targets", targetLocalId: last.localId, kind: "notice", draft }]);
        return false;
    }, [draft, currencyOptions, usdRate, settlementTypeOptions]);

    // (same as targets) adding a fee requires the last one to be complete: same rules as
    // saving, limited to that fee
    const canAddFee = useCallback(() => {
        const fees = draft?.fees ?? [];
        const last = fees[fees.length - 1];
        if (!last) return true;
        const normalized = normalizePlanDraft({ ...draft, fees: [last], targets: [] }, currencyOptions);
        const { issues, fieldErrorsByFee: fe } =
            validatePlanDraft(normalized, { usdRate, currencyOpts: currencyOptions, settlementTypeOptions });
        const feeIssues = (issues ?? []).filter((i) => i.section === "fees");
        if (!feeIssues.length) return true;
        setValidationAttempted(true);
        setFieldErrorsByFee((prev) => ({ ...prev, ...(fe || {}) }));
        const label = String(last.typeLabel ?? "").trim() || `Fee ${fees.length}`;
        const notice = `Complete "${label}" before adding another fee.`;
        setValidationErrors([notice, ...feeIssues.map((i) => i.message)]);
        setExtraIssues((prev) => [...prev.filter((i) => i.kind !== "notice"), { message: notice, section: "fees", feeIndex: fees.length - 1, kind: "notice", draft }]);
        return false;
    }, [draft, currencyOptions, usdRate, settlementTypeOptions]);

    const handleViewSimulation = useCallback(async () => {
        const normalized = normalizePlanDraft(draft, currencyOptions);
        const { valid, errors, fieldErrorsByTarget: fe, fieldErrorsByFee: feeFe, fieldErrorsContract: contractFe } =
            validatePlanDraft(normalized, { usdRate, currencyOpts: currencyOptions, settlementTypeOptions });

        if (!valid) {
            setValidationAttempted(true);
            setValidationErrors(errors);
            setFieldErrorsByTarget(fe || {});
            setFieldErrorsByFee(feeFe || {});
            setContractFieldErrors(contractFe || {});
            scrollModalToTop();
            resetSimulationPreview();
            setSimulationOpen(false);
            setSimulationModePickerOpen(false);
            setPendingSimulationResolved(null);
            setSimulationErrors([]);
            setSimulationResolved(null);
            return;
        }

        const resolved = buildResolvedFromPlanDraft(normalized, { settlementTypeOptions });
        if (resolved?.error) {
            setValidationAttempted(true);
            setValidationErrors([resolved.error]);
            setExtraIssues((prev) => [...prev.filter((i) => i.kind !== "notice"), { message: resolved.error, section: "targets", kind: "notice", draft }]);
            scrollModalToTop();
            resetSimulationPreview();
            setSimulationOpen(false);
            setSimulationResolved(null);
            return;
        }

        setSimulationErrors([]);
        setPendingSimulationResolved(resolved);
        setSimulationModePickerOpen(true);
        setValidationErrors([]);
        setFieldErrorsByTarget({});
        setFieldErrorsByFee({});
        setContractFieldErrors({});
        setValidationAttempted(false);
    }, [draft, currencyOptions, resetSimulationPreview, usdRate, settlementTypeOptions]);

    const handleSimulationModeChoice = useCallback(async (mode) => {
        setSimulationModePickerOpen(false);
        if (!pendingSimulationResolved) return;
        await runSimulationWithMode(pendingSimulationResolved, mode);
        setPendingSimulationResolved(null);
    }, [pendingSimulationResolved, runSimulationWithMode]);

    const handleApply = async () => {
        setExtraIssues([]);
        const normalized = normalizePlanDraft(draft, currencyOptions);
        const { valid, errors, fieldErrorsByTarget: fe, fieldErrorsByFee: feeFe, fieldErrorsContract: contractFe } =
            validatePlanDraft(normalized, { usdRate, currencyOpts: currencyOptions, settlementTypeOptions });

        if (!valid) {
            setValidationAttempted(true);
            setValidationErrors(errors);
            setFieldErrorsByTarget(fe || {});
            setFieldErrorsByFee(feeFe || {});
            setContractFieldErrors(contractFe || {});
            scrollModalToTop();
            return;
        }

        const ref = normalized.contractDraft?.ContractReference?.trim();
        const rejectReference = (message) => {
            setValidationAttempted(true);
            setContractFieldErrors({ ContractReference: message });
            setValidationErrors([message]);
            // dropped from the list as soon as the reference is changed
            setExtraIssues([{ message, section: "contract", kind: "reference", ref: ref.toLowerCase() }]);
            scrollModalToTop();
        };
        // 1) other contracts in this workspace, including ones applied but not saved yet
        //    (the database check below can't see those, the save would hit the unique key)
        if (ref) {
            const refKey = ref.toLowerCase();
            const ownId = String(normalized.contractDraft?.ContractID ?? "");
            const usedLocally = (contractRecordsForValidation ?? contractRecords ?? []).some((row) =>
                String(row?.ContractID ?? "") !== ownId
                && String(row?.ContractReference ?? "").trim().toLowerCase() === refKey
            );
            if (usedLocally) {
                rejectReference(`Contract reference "${ref}" is already used by another contract`);
                return;
            }
        }
        // 2) contracts saved in the database
        if (ref && authAxios) {
            try {
                const unique = await checkContractReferenceUnique(
                    authAxios,
                    ref,
                    normalized.contractDraft?.ContractID
                );
                if (!unique) {
                    rejectReference(`Contract reference "${ref}" is already used by another contract`);
                    return;
                }
            } catch {
                setValidationErrors(["Could not verify contract reference uniqueness"]);
                setExtraIssues([{ message: "Could not verify contract reference uniqueness", section: "contract", kind: "notice", draft }]);
                scrollModalToTop();
                return;
            }
        }

        setValidationErrors([]);
        setFieldErrorsByTarget({});
        setFieldErrorsByFee({});
        setContractFieldErrors({});
        setValidationAttempted(false);
        // the parent saves to the database and closes the modal when it succeeds
        await onApply(normalized);
    };

    // ── Export / Print handlers ──────────────────────────────────────────────

    // (reference) branded Excel workbook + printed report of the whole contract
    const reportLookups = useMemo(() => ({ settTypes: settlementTypeOptions ?? [] }), [settlementTypeOptions]);

    const handleExportExcel = useCallback(() => {
        if (!draft) return;
        exportContractToExcel(draft, reportLookups).catch(() => toast.error("The export failed."));
    }, [draft, reportLookups, toast]);

    const handlePrint = useCallback(async () => {
        if (!draft) return;
        const name = companyName || await loadCompanyName();
        printContractReport(draft, reportLookups, name);
    }, [draft, reportLookups, companyName]);

    // ────────────────────────────────────────────────────────────────────────

    if (!draft) return null;

    const activeFieldErrors = activeTarget?.localId
        ? fieldErrorsByTarget[activeTarget.localId]
        : undefined;

    // (reference) one Export menu: Excel + printed report

    const exportMenu = (
        <div className="ds-menu-anchor" ref={exportRef}>
            <button
                type="button"
                className="ds-btn ds-btn-secondary ce-btn-sm"
                aria-haspopup="menu"
                aria-expanded={exportOpen}
                onClick={() => setExportOpen((o) => !o)}
            >
                <Download size={15} />
                Export
                <ChevronDown size={15} />
            </button>
            {exportOpen && (
                <div className="ds-menu ce-menu-right" role="menu">
                    <button type="button" role="menuitem" className="ds-menu-item" onClick={() => { setExportOpen(false); handleExportExcel(); }}>
                        <FileSpreadsheet size={16} />
                        Export to Excel
                    </button>
                    <button type="button" role="menuitem" className="ds-menu-item" onClick={() => { setExportOpen(false); handlePrint(); }}>
                        <Printer size={16} />
                        Print report
                    </button>
                </div>
            )}
        </div>
    );

    // Toolbar shown top-right of modal, aligned with the modal title
    const modalHeaderToolbar = !isNew && (
        <div className="plan-editor-toolbar">
            <button
                type="button"
                className="plan-editor-toolbar-btn"
                title="Export to Excel"
                onClick={handleExportExcel}
            >
                <i className="fa fa-file-excel-o" />
                <span>Excel</span>
            </button>
            <button
                type="button"
                className="plan-editor-toolbar-btn"
                title="Print Report"
                onClick={handlePrint}
            >
                <i className="fa fa-print" />
                <span>Print</span>
            </button>
        </div>
    );

    const modalBody = (
        <div className={`plan-editor-modal-shell${readOnly ? " plan-editor-readonly" : ""}`}>
            <div className="plan-editor-modal-scroll" ref={modalContentRef}>
            <PlanModalValidationAlerts errors={validationErrors} summarize />

            <div data-issue-section="contract">
            <PlanContractSection
                contractDraft={draft.contractDraft}
                onChange={(cd) => {
                    if (readOnly) return;
                    setContractFieldErrors((prev) => {
                        const next = { ...prev };
                        // a uniqueness error (string) is cleared only when the reference changes
                        if (typeof next.ContractReference !== "string") delete next.ContractReference;
                        delete next.contractCurrency;
                        return next;
                    });
                    handleContractChange(cd);
                }}
                authAxios={authAxios}
                clientLabelById={clientLabelById}
                setClientLabelById={setClientLabelById}
                onValidationError={appendValidationErrors}
                fieldErrors={contractFieldErrors}
                validationAttempted={validationAttempted}
                currencyOptions={currencyOptions}
                selectMenuProps={selectMenuProps}
                readOnly={readOnly}
            />
            </div>

            <PlanWorkspaceAccordion
                title="Plan Details"
                defaultOpen
                level="primary"
                sectionId="plan"
                openSignal={openSignals.plan}
            >
                <PlanFormSection
                    plan={draft.plan}
                    onChange={(plan) => {
                        if (readOnly) return;
                        setDraft((d) => ({ ...d, plan }));
                    }}
                    typeOptions={visibleTypeOptions}
                    selectMenuProps={selectMenuProps}
                    validationAttempted={validationAttempted}
                    readOnly={readOnly}
                />

                <PlanWorkspaceAccordion
                    title="Fees"
                    defaultOpen={false}
                    level="nested"
                    sectionId="fees"
                    openSignal={openSignals.fees}
                >
                    <PlanFeesSection
                        fees={draft.fees}
                        onChange={(fees) => {
                            if (readOnly) return;
                            setDraft((d) => ({ ...d, fees }));
                        }}
                        contractCurrencyCode={contractCurrencyCode}
                        settlementTypeOptions={visibleSettlementTypeOptions}
                        selectMenuProps={selectMenuProps}
                        validationAttempted={validationAttempted}
                        fieldErrorsByFee={fieldErrorsByFee}
                        readOnly={readOnly}
                        canAddFee={canAddFee}
                    />
                </PlanWorkspaceAccordion>

                <PlanWorkspaceAccordion
                    title="Targets"
                    defaultOpen
                    level="nested"
                    sectionId="targets"
                    openSignal={openSignals.targets}
                >
                    <div className="d-flex plan-targets-layout" style={{ minHeight: 480, flexWrap: "wrap" }}>
                        {!targetNavCollapsed && (
                            <TargetListNav
                                targets={draft.targets}
                                fees={draft.fees}
                                activeLocalId={activeTarget?.localId}
                                onSelect={setActiveTargetId}
                                onChange={(targets) => {
                                    if (readOnly) return;
                                    setDraft((d) => ({ ...d, targets }));
                                }}
                                selectMenuProps={selectMenuProps}
                                readOnly={readOnly}
                                canAddTarget={canAddTarget}
                            />
                        )}

                        <TargetEditorPanel
                            target={activeTarget}
                            inlineTargetNav={targetNavCollapsed ? (
                                <TargetSelectorBar
                                    targets={draft.targets}
                                    fees={draft.fees}
                                    activeLocalId={activeTarget?.localId}
                                    onSelect={setActiveTargetId}
                                    onChange={(targets) => {
                                        if (readOnly) return;
                                        setDraft((d) => ({ ...d, targets }));
                                    }}
                                    selectMenuProps={selectMenuProps}
                                    readOnly={readOnly}
                                    canAddTarget={canAddTarget}
                                />
                            ) : null}
                            fieldErrors={activeFieldErrors}
                            validationAttempted={validationAttempted}
                            usdRate={usdRate}
                            computationTypeOptions={visibleComputationTypeOptions}
                            settlementTypeOptions={visibleSettlementTypeOptions}
                            onChange={(t) => {
                                if (readOnly) return;
                                setDraft((d) => ({
                                    ...d,
                                    targets: d.targets.map((x) => (x.localId === t.localId ? t : x)),
                                }));

                                if (!t.localId || !fieldErrorsByTarget[t.localId]) return;

                                const prevTarget = draft?.targets?.find((x) => x.localId === t.localId);
                                const prevType = normalizeRebateValueType(prevTarget?.rebateValueType);
                                const nextType = normalizeRebateValueType(t.rebateValueType);

                                setFieldErrorsByTarget((prev) => {
                                    const next = { ...prev };
                                    const fe = next[t.localId];
                                    if (!fe) return next;

                                    if (prevType !== nextType && nextType === "P") {
                                        const { currency: _c, ...rest } = fe;
                                        if (Object.keys(rest).length === 0) delete next[t.localId];
                                        else next[t.localId] = rest;
                                    } else {
                                        delete next[t.localId];
                                    }
                                    return next;
                                });
                            }}
                            contractCurrencyCode={contractCurrencyCode}
                            selectMenuProps={selectMenuProps}
                            readOnly={readOnly}
                            authAxios={authAxios}
                            onNotify={(type, title, message) => {
                                if (readOnly) return;
                                if (type === "error") {
                                    const text = message ? `${title}: ${message}` : title;
                                    appendValidationErrors(text);
                                }
                            }}
                        />
                    </div>
                </PlanWorkspaceAccordion>
            </PlanWorkspaceAccordion>
            </div>
            <div className="plan-editor-modal-footer-bar">
                <button
                    type="button"
                    className="ds-btn ds-btn-secondary"
                    onClick={() => void handleViewSimulation()}
                >
                    <FlaskConical size={16} />
                    Simulation
                </button>
                <div className="ce-footer-status ms-3">
                    {issues.length > 0 ? (
                        <div className="ds-menu-anchor" ref={issuesRef}>
                            <button type="button" className="ce-issues-btn" onClick={() => setIssuesOpen((o) => !o)} aria-haspopup="menu" aria-expanded={issuesOpen}>
                                <AlertTriangle size={15} />
                                {issues.length} {issues.length === 1 ? "issue" : "issues"} to fix
                                <ChevronDown size={14} />
                            </button>
                            {issuesOpen && (
                                <div className="ds-menu ce-issues-menu" role="menu">
                                    {issues.map((issue, idx) => (
                                        <button
                                            key={`${idx}-${issue.message}`}
                                            type="button"
                                            role="menuitem"
                                            className="ds-menu-item"
                                            title="Go to this issue"
                                            onClick={() => goToIssue(issue)}
                                        >
                                            <span className="ce-issue-section">{SECTION_LABEL[issue.section] ?? issueSection(issue.message)}</span>
                                            <span className="ce-issue-text">{issue.message}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : !readOnly && validationAttempted ? (
                        <span className="ce-clean"><CircleCheck size={15} /> No issues</span>
                    ) : null}
                </div>
                <div className="plan-editor-modal-footer-bar__primary">
                    <button
                        type="button"
                        className="ds-btn ds-btn-secondary"
                        onClick={requestClose}
                        disabled={saving}
                    >
                        {readOnly ? "Close" : "Cancel"}
                    </button>
                    {!readOnly && (
                        <button
                            type="button"
                            className="ds-btn ds-btn-success"
                            onClick={() => void handleApply()}
                            disabled={saving}
                        >
                            {saving
                                ? <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                                : <Save size={16} />}
                            {saving ? "Saving…" : "Save"}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );

    return (
        <>
        <ModalComp
            modal={open}
            modalTitle={
                <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
                    <span style={{ flex: 1 }}>
                        {readOnly ? "View Contract (locked)" : isNew ? "Add Contract" : "Edit Contract"}
                    </span>
                    {!isNew && (
                        <div style={{ marginLeft: "auto", paddingRight: "32px" }}>
                            {exportMenu}
                        </div>
                    )}
                </div>
            }
            modalBody={modalBody}
            onClose={requestClose}
            hideFooterButtons
            size="xl"
            className="importDataModal planEditorModal"
        />

        <ModalComp
            modal={simulationModePickerOpen}
            modalTitle="Choose simulation view:"
            modalBody={(
                <div className="d-flex gap-3 py-2">
                    <button
                        type="button"
                        className="ds-btn ds-btn-primary flex-grow-1"
                        onClick={() => void handleSimulationModeChoice("current")}
                    >
                        View Current Simulation
                    </button>
                    <button
                        type="button"
                        className="ds-btn ds-btn-secondary flex-grow-1"
                        onClick={() => void handleSimulationModeChoice("previousYear")}
                    >
                        View Previous Year Simulation
                    </button>
                </div>
            )}
            onClose={() => {
                setSimulationModePickerOpen(false);
                setPendingSimulationResolved(null);
            }}
            onCloseText="Cancel"
            size="md"
        />

        <ModalComp
            modal={simulationOpen}
            modalTitle={
                simulationMode === "previousYear"
                    ? "Computation Simulation - Previous Year"
                    : "Computation Simulation - Current"
            }
            modalBody={(
                <div className="cvr-workspace-root py-2 computation-simulation-modal">
                    {simulationErrors.length > 0 && (
                        <div className="alert alert-warning py-2 px-3 mb-3">
                            {simulationErrors.map((msg) => (
                                <div key={msg}>{msg}</div>
                            ))}
                        </div>
                    )}
                    {simulationLoadingSales && !simulationPreview && (
                        <div className="d-flex align-items-center gap-2 text-muted py-3">
                            <div className="spinner-border spinner-border-sm text-secondary" role="status" />
                            <span>Loading computation simulation...</span>
                        </div>
                    )}
                    {simulationResolved && (
                        <ComputationResultsPanel
                            resolved={simulationResolved}
                            previewResults={simulationPreview}
                            salesByTargetId={simulationSalesById}
                            salesMetaByTargetId={simulationSalesMeta}
                            loadingSales={simulationLoadingSales}
                            isLoading={simulationLoadingSales}
                            dailyRate={usdRate}
                            showDetailsLink={false}
                            layoutVariant="simulation"
                            showBreakdowns
                            fetchSalesForDraftWindows={fetchSimulationSalesForDraftWindows}
                            allClientIds={simulationClientIds}
                            asOf={simulationAsOfDate}
                            lastAccountingGenerationDate={lastAccountingGenerationDate}
                        />
                    )}
                </div>
            )}
            onClose={() => {
                setSimulationOpen(false);
                setSimulationErrors([]);
                setSimulationMode("current");
                resetSimulationPreview();
            }}
            onCloseText="Close"
            hideFooterButtons={false}
            showCloseIcon
            size="xl"
            className="importDataModal planEditorModal"
        />

        <ModalComp
            modal={confirmDiscardOpen}
            modalTitle="Discard changes?"
            modalBody={(
                <>
                    <p className="mb-0">
                        {isNew
                            ? "This contract hasn't been applied yet. Closing now discards everything you entered."
                            : "You have unsaved changes to this contract. Closing now discards them."}
                    </p>
                    <div className="picker-modal-footer">
                        <button type="button" className="ds-btn ds-btn-secondary" onClick={() => setConfirmDiscardOpen(false)}>
                            Keep editing
                        </button>
                        <button
                            type="button"
                            className="ds-btn ds-btn-danger"
                            onClick={() => {
                                setConfirmDiscardOpen(false);
                                onClose?.();
                            }}
                        >
                            Discard
                        </button>
                    </div>
                </>
            )}
            onClose={() => setConfirmDiscardOpen(false)}
            hideFooterButtons
            size="md"
        />
        </>
    );
}