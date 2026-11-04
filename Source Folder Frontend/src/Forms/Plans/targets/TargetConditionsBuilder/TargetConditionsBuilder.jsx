import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { DragDropContext, Draggable, Droppable } from "react-beautiful-dnd";
import { GripVertical, Plus, X } from "lucide-react";

import { InputNumericComp, SelectComp } from "../../../../ReusableComponents";
import { useToaster } from "../../../../ui/toast/Toaster";
import { getApiBase } from "../../../../globals";
import { GROWTH_COMPARISON_CAPTION } from "../../constants/planWorkspaceConstants";
import {
    getConditionGroupSaveErrors,
    isConditionComplete,
    simplifyRedundantRangeConditions,
    validateConditionGroup,
} from "../../utils/targetConditionValidation";
import {
    createEmptyCondition,
    createEmptyGroup,
    moveCondition,
    groupDroppableId,
    conditionDraggableId,
    NEW_GROUP_DROPPABLE_ID,
} from "../../../../utils/conditionGroups";
import { numericPropsForType, valuePlaceholderForType } from "../../utils/numericPropsForConditionType";
import { METRICS, OPERATORS, metricUnit } from "../../utils/targetSummary";
import "../../styles/contractEditor.css";

const metricOptions = METRICS.map((m) => ({ value: m.value, label: m.label }));
// "=" isn't offered for new conditions (an exact figure is meaningless as a target); older ones keep it.
const toOption = (o) => ({ value: o.value, label: `${o.label}  ${o.word}` });
const operatorOptions = OPERATORS.filter((o) => o.value !== "=").map(toOption);
const operatorOptionsFor = (current) =>
    (current === "=" ? [...operatorOptions, toOption(OPERATORS.find((o) => o.value === "="))] : operatorOptions);
const findOpt = (options, value) => options.find((o) => o.value === value) || null;
const optValue = (v) => (v && typeof v === "object" ? v.value : v) || null;

// The builder calls blocks "sets".
const readable = (msg) => msg.replace(/\bBlock (\d+)/g, "Set $1");

/** Contradictions and redundancies among complete conditions (incomplete rows are shown inline). */
function conditionProblems(groups, usdRate) {
    const errors = getConditionGroupSaveErrors(groups, usdRate).filter((m) => !/incomplete condition/i.test(m));
    const warnings = groups.flatMap((g, i) => validateConditionGroup(g, i, usdRate).warnings);
    return [...new Set([...errors, ...warnings])].map(readable);
}

// The first set never joins a previous one; later sets default to OR.
const normalizeJoins = (groups) =>
    groups.map((g, i) => ({ ...g, joinWithPrevious: i === 0 ? null : (g.joinWithPrevious || "OR") }));

const newCondition = () => ({ ...createEmptyCondition(), operator: ">=" });
const newGroup = () => {
    const group = createEmptyGroup();
    group.conditions = [newCondition()];
    return group;
};

/*
 * Conditions inside a set must all hold (AND); sets are alternatives (OR).
 * Conditions can be dragged between sets, or onto the drop zone to start a new set.
 * Empty = the rebate applies to all purchases in the target period.
 * `required` (a fixed rebate): at least one condition, the last one can't be removed.
 */
export default function TargetConditionsBuilder({
    conditionGroups,
    onChange,
    contractCurrencyCode = "",
    selectMenuProps,
    usdRate: usdRateProp = null,
    readOnly = false,
    required = false,
    showErrors = false,
}) {
    const toast = useToaster();
    const list = useMemo(() => conditionGroups ?? [], [conditionGroups]);
    const [dragging, setDragging] = useState(false);
    const [usdRateLocal, setUsdRateLocal] = useState(null);

    useEffect(() => {
        if (usdRateProp != null) return undefined;
        let cancelled = false;
        axios.get(`${getApiBase()}/CVRDailyRates/current`, {
            headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        })
            .then((res) => {
                if (cancelled) return;
                const rate = (res?.data?.[0] ?? res?.data)?.rate;
                setUsdRateLocal(rate != null && Number.isFinite(Number(rate)) ? Number(rate) : null);
            })
            .catch(() => { if (!cancelled) setUsdRateLocal(null); });
        return () => { cancelled = true; };
    }, [usdRateProp]);

    const usdRate = usdRateProp ?? usdRateLocal;
    const problems = useMemo(() => conditionProblems(list, usdRate), [list, usdRate]);
    const lastOne = required && list.reduce((n, g) => n + g.conditions.length, 0) <= 1;

    // Redundant range conditions in a set (e.g. ≥ 10 and ≥ 20) are folded together.
    const applyGroupChange = (groupId, updater) => {
        let notice = null;
        const next = list.map((g) => {
            if (g.id !== groupId) return g;
            const updated = updater(g);
            const { group, simplified, message } = simplifyRedundantRangeConditions(updated);
            if (simplified && message) notice = message;
            return simplified ? group : updated;
        });
        if (notice) toast.info(notice);
        onChange(next);
    };

    const updateCondition = (groupId, condId, patch) =>
        applyGroupChange(groupId, (g) => ({
            ...g,
            conditions: g.conditions.map((c) => (c.id === condId ? { ...c, ...patch } : c)),
        }));

    const removeCondition = (groupId, condId) => {
        const next = list
            .map((g) => (g.id === groupId ? { ...g, conditions: g.conditions.filter((c) => c.id !== condId) } : g))
            .filter((g) => g.conditions.length > 0);
        onChange(normalizeJoins(next));
    };

    const guardComplete = () => {
        const incomplete = list.some((g) => g.conditions.some((c) => !isConditionComplete(c)));
        if (!incomplete) return true;
        toast.error("Complete the current condition before adding another.");
        return false;
    };

    const addCondition = (groupId) => {
        if (!guardComplete()) return;
        applyGroupChange(groupId, (g) => ({ ...g, conditions: [...g.conditions, newCondition()] }));
    };

    const addGroup = () => {
        if (!guardComplete()) return;
        onChange(normalizeJoins([...list, newGroup()]));
    };

    const onDragEnd = ({ source, destination }) => {
        setDragging(false);
        if (!destination) return;
        const moved = moveCondition(list, source, destination);
        if (moved === list) return;
        const next = normalizeJoins(moved);
        const before = conditionProblems(list, usdRate);
        const after = conditionProblems(next, usdRate);
        if (after.length > before.length) {
            const introduced = after.find((m) => !before.includes(m)) ?? after[0];
            toast.error(`Can't move it there. ${introduced}`);
            return;
        }
        onChange(next);
    };

    if (list.length === 0) {
        return (
            <div className="ce-cond-empty">
                <span className={required && showErrors ? "text-danger" : undefined}>
                    {required
                        ? "A fixed rebate needs at least one condition."
                        : "No conditions. The rebate applies to all purchases in the target period."}
                </span>
                {!readOnly && (
                    <button type="button" className="ds-btn ds-btn-secondary ce-btn-sm" onClick={addGroup}>
                        <Plus size={15} />
                        Add condition
                    </button>
                )}
            </div>
        );
    }

    return (
        <DragDropContext onDragStart={() => setDragging(true)} onDragEnd={onDragEnd}>
            <div className="ce-cond">
                {list.map((g, gi) => (
                    <React.Fragment key={g.id}>
                        {gi > 0 && (
                            <div className="ce-cond-join" aria-label="or">
                                <span>{(g.joinWithPrevious || "OR").toUpperCase()}</span>
                            </div>
                        )}
                        <Droppable droppableId={groupDroppableId(g.id)} isDropDisabled={readOnly}>
                            {(drop, dropState) => (
                                <div
                                    ref={drop.innerRef}
                                    {...drop.droppableProps}
                                    className={`ce-cond-group${dropState.isDraggingOver ? " is-over" : ""}`}
                                >
                                    <div className="ce-cond-group-head">
                                        {list.length > 1 ? `Condition set ${gi + 1}` : "All of these must be met"}
                                    </div>
                                    {g.conditions.map((c, ci) => {
                                        const incomplete = showErrors && !isConditionComplete(c);
                                        const invalidStyle = { border: "1px solid var(--color-danger)", borderRadius: 4 };
                                        return (
                                            <Draggable key={c.id} draggableId={conditionDraggableId(c.id)} index={ci} isDragDisabled={readOnly}>
                                                {(drag, dragState) => (
                                                    <div
                                                        ref={drag.innerRef}
                                                        {...drag.draggableProps}
                                                        className={`ce-cond-row ce-cond-row--comp${dragState.isDragging ? " is-dragging" : ""}`}
                                                    >
                                                        <span
                                                            className="ce-cond-grip"
                                                            {...drag.dragHandleProps}
                                                            title={readOnly ? undefined : "Drag to another set"}
                                                            aria-label="Drag condition"
                                                        >
                                                            {!readOnly && <GripVertical size={16} />}
                                                        </span>
                                                        <span className="ce-cond-and">{ci === 0 ? "If" : "and"}</span>
                                                        <div style={incomplete && !c.conditionType ? invalidStyle : undefined}>
                                                            <SelectComp
                                                                name={`ctype_${c.id}`}
                                                                value={findOpt(metricOptions, c.conditionType)}
                                                                options={metricOptions}
                                                                placeholder="Metric"
                                                                disabled={readOnly}
                                                                // a new metric means a new unit: the old value no longer applies
                                                                onChange={(v) => {
                                                                    const next = optValue(v);
                                                                    updateCondition(g.id, c.id, {
                                                                        conditionType: next,
                                                                        salesAmountCurrency: next === "S" ? c.salesAmountCurrency : null,
                                                                        value: next === c.conditionType ? c.value : "",
                                                                    });
                                                                }}
                                                                {...selectMenuProps}
                                                            />
                                                        </div>
                                                        <div style={incomplete && !c.operator ? invalidStyle : undefined}>
                                                            <SelectComp
                                                                name={`op_${c.id}`}
                                                                value={findOpt(operatorOptionsFor(c.operator), c.operator)}
                                                                options={operatorOptionsFor(c.operator)}
                                                                placeholder="Operator"
                                                                disabled={readOnly}
                                                                onChange={(v) => updateCondition(g.id, c.id, { operator: optValue(v) })}
                                                                {...selectMenuProps}
                                                            />
                                                        </div>
                                                        <InputNumericComp
                                                            name={`val_${c.id}`}
                                                            value={c.value}
                                                            placeholder={valuePlaceholderForType(c.conditionType)}
                                                            suffix={metricUnit(c.conditionType, contractCurrencyCode) ? ` ${metricUnit(c.conditionType, contractCurrencyCode)}` : ""}
                                                            handleChange={(v) => updateCondition(g.id, c.id, { value: v })}
                                                            className={incomplete && (c.value === "" || c.value == null) ? "alert-danger" : ""}
                                                            disabled={readOnly || !c.conditionType}
                                                            {...numericPropsForType(c.conditionType)}
                                                        />
                                                        {!readOnly ? (
                                                            <button
                                                                type="button"
                                                                className="ds-btn ds-btn-icon"
                                                                onClick={() => removeCondition(g.id, c.id)}
                                                                disabled={lastOne}
                                                                aria-label="Remove condition"
                                                                title={lastOne ? "A fixed rebate needs at least one condition" : "Remove condition"}
                                                            >
                                                                <X size={16} />
                                                            </button>
                                                        ) : <span />}
                                                        {c.conditionType === "G" && (
                                                            <small className="ce-cond-caption text-muted">{GROWTH_COMPARISON_CAPTION}</small>
                                                        )}
                                                    </div>
                                                )}
                                            </Draggable>
                                        );
                                    })}
                                    {drop.placeholder}
                                    {!readOnly && (
                                        <button type="button" className="ds-btn ds-btn-ghost ce-btn-sm ce-cond-add" onClick={() => addCondition(g.id)}>
                                            <Plus size={14} />
                                            And another condition
                                        </button>
                                    )}
                                </div>
                            )}
                        </Droppable>
                    </React.Fragment>
                ))}

                {!readOnly && (
                    <Droppable droppableId={NEW_GROUP_DROPPABLE_ID}>
                        {(drop, dropState) => (
                            <div ref={drop.innerRef} {...drop.droppableProps} className="ce-cond-new-zone-wrap">
                                {dragging ? (
                                    <div className={`ce-cond-new-zone${dropState.isDraggingOver ? " is-over" : ""}`}>
                                        Drop here to make it a new alternative (OR)
                                    </div>
                                ) : (
                                    <button type="button" className="ce-cond-or-btn" onClick={addGroup}>
                                        <Plus size={15} />
                                        Add an alternative (OR)
                                    </button>
                                )}
                                <span style={{ display: "none" }}>{drop.placeholder}</span>
                            </div>
                        )}
                    </Droppable>
                )}

                {problems.length > 0 && (
                    <ul className="ce-inline-errors">
                        {problems.map((p) => <li key={p}>{p}</li>)}
                    </ul>
                )}
            </div>
        </DragDropContext>
    );
}
