import { useState } from "react";
import { Filter, ListOrdered, MessageSquareText } from "lucide-react";
import {
    DateTimePickerComp,
    InputNumericComp,
    InputTextComponent,
    SelectComp,
    ConfirmModal,
} from "../../../../ReusableComponents";
import TargetConditionsBuilder from "../TargetConditionsBuilder/TargetConditionsBuilder";
import TargetReferencesSection from "../TargetReferencesSection/TargetReferencesSection";
import TargetTiersBuilder from "../TargetTiersBuilder/TargetTiersBuilder";
import Segmented from "../../components/Segmented/Segmented";
import { normalizeRebateValueType } from "../../../../utils/planWorkspaceValidation";
import { moneyDecimalScale } from "../../utils/numericPropsForConditionType";
import { createEmptyGroup } from "../../../../utils/conditionGroups";
import { describeFormulaRule } from "../../utils/targetSummary";
import "../../styles/contractEditor.css";

const hasSelectValue = (sel) => {
    if (sel == null || sel === "") return false;
    if (typeof sel === "object") {
        const v = sel.value;
        return v != null && String(v).trim() !== "";
    }
    return String(sel).trim() !== "";
};

const MODES = [
    { value: "formula", label: "Conditions", icon: <Filter size={14} /> },
    { value: "range", label: "Tiers", icon: <ListOrdered size={14} /> },
];

const filled = (v) => v !== "" && v != null;
const isBlankCondition = (c) => !c.conditionType && !filled(c.value);

/*
 * (Sales Volume Rebate reference) A fixed rebate must be earned by meeting something, so
 * choosing "Fixed" on a target with no conditions adds an empty one to fill in; going back
 * to "%" drops conditions still left blank (a % target with no conditions applies always).
 */
function rewardTypePatch(target, type) {
    const groups = target.conditionGroups ?? [];
    if (type === "F" && !groups.some((g) => (g.conditions ?? []).length)) {
        const group = createEmptyGroup();
        group.conditions = [{ ...group.conditions[0], operator: ">=" }];
        return { rebateValueType: type, rebateValue: "", conditionGroups: [{ ...group, joinWithPrevious: null }] };
    }
    if (type === "P") {
        const kept = groups
            .map((g) => ({ ...g, conditions: (g.conditions ?? []).filter((c) => !isBlankCondition(c)) }))
            .filter((g) => g.conditions.length)
            .map((g, i) => ({ ...g, joinWithPrevious: i === 0 ? null : g.joinWithPrevious || "OR" }));
        return { rebateValueType: type, rebateValue: "", currency: null, conditionGroups: kept };
    }
    return { rebateValueType: type, rebateValue: "" };
}

const hasFormulaData = (target) => {
    const groups = target.conditionGroups || [];
    const hasConditions = groups.some((g) =>
        (g.conditions || []).some(
            (c) => c.conditionType || c.operator || (c.value !== "" && c.value != null)
        )
    );
    const rebateSet = target.rebateValue !== "" && target.rebateValue != null;
    return hasConditions || rebateSet;
};

const hasRangeData = (target) => {
    const tiers = target.tiers || [];
    const hasTiers = tiers.some(
        (t) =>
            (t.value !== "" && t.value != null) ||
            (t.rebateValue !== "" && t.rebateValue != null)
    );
    return hasTiers || !!target.tierConditionType;
};

export default function TargetEditorPanel({
    target,
    onChange,
    contractCurrencyCode = "",
    computationTypeOptions,
    settlementTypeOptions,
    selectMenuProps,
    onNotify,
    fieldErrors,
    validationAttempted,
    usdRate = null,
    inlineTargetNav = null,
    readOnly = false,
    authAxios,
}) {
    const fieldLock = readOnly ? { disabled: true, readOnly: true } : {};
    const [targetTypeSwitchConfirm, setTargetTypeSwitchConfirm] = useState(null);
    const [targetTypeResetNonce, setTargetTypeResetNonce] = useState(0);
    const [missingTargetName, setMissingTargetName] = useState(false);
    const [missingFromDate, setMissingFromDate] = useState(false);
    const [missingToDate, setMissingToDate] = useState(false);
    const [missingComputationTypeId, setMissingComputationTypeId] = useState(false);
    const [missingSettlementTypeId, setMissingSettlementTypeId] = useState(false);

    if (!target) {
        return <div className="text-muted p-3">Select a target from the list.</div>;
    }


    const handleChange = (value, name) => {
        if (readOnly) return;
        if (name === "targetName" && String(value ?? "").trim()) setMissingTargetName(false);
        if (name === "fromDate" && value) setMissingFromDate(false);
        if (name === "toDate" && value) setMissingToDate(false);
        if (name === "computationTypeId" && hasSelectValue(value)) setMissingComputationTypeId(false);
        if (name === "settlementTypeId" && hasSelectValue(value)) setMissingSettlementTypeId(false);
        onChange({ ...target, [name]: value });
    };

    const targetNameInvalid =
        missingTargetName
        || fieldErrors?.targetName
        || (validationAttempted && !target.targetName?.trim());
    const fromDateInvalid =
        missingFromDate || fieldErrors?.fromDate || (validationAttempted && !target.fromDate);
    const toDateInvalid =
        missingToDate || fieldErrors?.toDate || (validationAttempted && !target.toDate);
    const computationTypeInvalid =
        missingComputationTypeId
        || fieldErrors?.computationTypeId
        || (validationAttempted && !hasSelectValue(target.computationTypeId));
    const settlementTypeInvalid =
        missingSettlementTypeId
        || fieldErrors?.settlementTypeId
        || (validationAttempted && !hasSelectValue(target.settlementTypeId));

    const targetType = target.targetType || "formula";
    const isFormula = targetType === "formula";

    const rebateType = normalizeRebateValueType(target.rebateValueType);
    const isFixed = rebateType === "F";

    const handleRebateTypeChange = (opt) => {
        if (readOnly) return;
        const nextType = normalizeRebateValueType(opt);
        if (nextType === rebateType) return;
        // a new unit: the old value no longer applies (e.g. 500 fixed would become 500%)
        onChange({ ...target, ...rewardTypePatch(target, nextType) });
    };

    const applyTargetTypeSwitch = (nextType) => {
        const switchingToRange = nextType === "range";
        if (switchingToRange) {
            onChange({
                ...target,
                targetType: "range",
                conditionGroups: [],
                rebateValue: "",
                rebateValueType: null,
                currency: null,
            });
        } else {
            onChange({
                ...target,
                targetType: "formula",
                tiers: [],
                tierConditionType: null,
                salesAmountCurrency: null,
            });
        }
    };

    const handleTargetTypeChange = (v) => {
        if (readOnly) return;
        const nextType = (v && typeof v === "object" ? v.value : v) || "formula";
        const prevType = target.targetType || "formula";
        if (nextType === prevType) return;

        const switchingToRange = nextType === "range";
        const wouldDiscard = switchingToRange
            ? hasFormulaData(target)
            : hasRangeData(target);

        if (wouldDiscard) {
            const label = switchingToRange ? "Range" : "Formula";
            const cleared = switchingToRange ? "conditions" : "ranges";
            setTargetTypeSwitchConfirm({
                nextType,
                message: `Switching to ${label} will clear your existing ${cleared}. Are you sure?`,
            });
            return;
        }

        applyTargetTypeSwitch(nextType);
    };

    return (
        <div className="flex-grow-1 ps-3">
            {inlineTargetNav}
            <div className="row align-items-end g-2 mb-3">
                <div className="col-md-3">
                    <div style={computationTypeInvalid ? { border: "1px solid #dc3545", borderRadius: 4 } : undefined}>
                        <SelectComp
                            name="computationTypeId"
                            value={target.computationTypeId}
                            options={computationTypeOptions}
                            onChange={handleChange}
                            placeholder={<>Computation Type <span className="required">*</span></>}
                            clearable
                            {...selectMenuProps}
                        />
                    </div>
                </div>
                <div className="col-md-2">
                    <div style={settlementTypeInvalid ? { border: "1px solid #dc3545", borderRadius: 4 } : undefined}>
                        <SelectComp
                            name="settlementTypeId"
                            value={target.settlementTypeId}
                            options={settlementTypeOptions}
                            onChange={handleChange}
                            placeholder={<>Settlement Type <span className="required">*</span></>}
                            clearable
                            {...selectMenuProps}
                        />
                    </div>
                </div>
            </div>

            <div className="row align-items-end g-2 mb-3">
                <div className="col-md-3">
                    <InputTextComponent name="targetName" value={target.targetName}
                        placeholder={<>Target name <span className="required">*</span></>}
                        handleChange={handleChange}
                        handleOnblur={(value) => {
                            if (!String(value ?? "").trim()) setMissingTargetName(true);
                        }}
                        className={targetNameInvalid ? "alert-danger" : ""}
                        maxLength={100}
                        {...fieldLock} />
                </div>
                <div className="col-md-2">
                    <DateTimePickerComp name="fromDate" value={target.fromDate}
                        selected={target.fromDate} onDateTimeChange={handleChange}
                        placeholder={<>Start date <span className="required">*</span></>}
                        invalid={fromDateInvalid}
                        clearable
                        {...fieldLock} />
                </div>
                <div className="col-md-2">
                    <DateTimePickerComp name="toDate" value={target.toDate}
                        selected={target.toDate} onDateTimeChange={handleChange}
                        placeholder={<>End date <span className="required">*</span></>}
                        invalid={toDateInvalid}
                        clearable
                        {...fieldLock} />
                </div>
                {/* {target.targetType === "range" && (
                    <div className="d-flex align-items-center gap-2 mt-2">
                        <input
                            type="checkbox"
                            id={`override_${target.localId}`}
                            className="form-check-input m-0"
                            checked={target.rangeOverride ?? false}
                            onChange={(e) => onChange({ ...target, rangeOverride: e.target.checked })}
                        />
                        <label
                            htmlFor={`override_${target.localId}`}
                            className="form-check-label small text-muted"
                            style={{ cursor: "pointer", size: "50px" }}
                        >
                            Override - give all passed ranges
                        </label>
                    </div>
                )} */}
            </div>

            <div className="ce-card mb-3">
                <div className="ce-card-head">
                    <div>
                        <div className="ce-card-title">Rebate rule</div>
                        <div className="ce-card-desc">
                            {isFormula
                                ? "One rebate, paid when the conditions are met."
                                : "The rebate grows with performance, tier by tier."}
                        </div>
                    </div>
                    <Segmented
                        key={`targetType-${target.localId}-${targetTypeResetNonce}`}
                        value={targetType}
                        options={MODES}
                        onChange={handleTargetTypeChange}
                        disabled={readOnly}
                    />
                </div>

                {isFormula && (
                    <>
                        <div className="ce-reward-row">
                            <span className="ds-label">Rebate<span className="ds-req">*</span></span>
                            <div className="ce-reward">
                                <div className="ce-reward-input">
                                    <InputNumericComp
                                        name="rebateValue"
                                        value={target.rebateValue}
                                        placeholder={<>{isFixed ? "Amount" : "Rebate %"} <span className="required">*</span></>}
                                        handleChange={handleChange}
                                        className={
                                            fieldErrors?.rebateValue || (validationAttempted && (
                                                target.rebateValue === "" ||
                                                target.rebateValue == null ||
                                                Number(target.rebateValue) <= 0
                                            )) ? "alert-danger" : ""
                                        }
                                        thousandSeparator={isFixed}
                                        decimalScale={isFixed ? moneyDecimalScale(contractCurrencyCode, 3) : 2}
                                        maxValue={!isFixed ? 100 : 999999999999999}
                                        {...fieldLock}
                                    />
                                </div>
                                <Segmented
                                    value={rebateType}
                                    options={[
                                        { value: "P", label: "% of Purchases" },
                                        { value: "F", label: `Fixed ${contractCurrencyCode || ""}`.trim() },
                                    ]}
                                    onChange={handleRebateTypeChange}
                                    invalid={!!fieldErrors?.currency}
                                    disabled={readOnly}
                                />
                            </div>
                        </div>

                        <TargetConditionsBuilder
                            conditionGroups={target.conditionGroups}
                            onChange={(groups) => onChange({ ...target, conditionGroups: groups })}
                            contractCurrencyCode={contractCurrencyCode}
                            selectMenuProps={selectMenuProps}
                            usdRate={usdRate}
                            readOnly={readOnly}
                            required={isFixed}
                            showErrors={!!validationAttempted}
                        />

                        <div className="ce-rule-preview">
                            <MessageSquareText size={16} />
                            <span>{describeFormulaRule(target, contractCurrencyCode)}</span>
                        </div>
                    </>
                )}

                {!isFormula && (
                    <TargetTiersBuilder
                        tiers={target.tiers}
                        tierConditionType={target.tierConditionType}
                        salesAmountCurrency={target.salesAmountCurrency}
                        onTierConditionTypeChange={(value) => {
                            if (value === target.tierConditionType) return;
                            onChange({
                                ...target,
                                tierConditionType: value,
                                salesAmountCurrency: value === "S" ? target.salesAmountCurrency : null,
                                tiers: [],
                            });
                        }}
                        onSalesAmountCurrencyChange={(value) =>
                            onChange({ ...target, salesAmountCurrency: value })
                        }
                        onChange={(tiers) => onChange({ ...target, tiers })}
                        contractCurrencyCode={contractCurrencyCode}
                        selectMenuProps={selectMenuProps}
                        readOnly={readOnly}
                        fieldErrors={fieldErrors}
                        validationAttempted={validationAttempted}
                    />
                )}
            </div>

            <div className="ce-card">
                <div className="ce-card-head">
                    <div>
                        <div className="ce-card-title">Scope</div>
                        <div className="ce-card-desc">Which purchases count toward this target.</div>
                    </div>
                </div>
                <TargetReferencesSection
                    target={target}
                    onChange={onChange}
                    selectMenuProps={selectMenuProps}
                    onNotify={onNotify}
                    readOnly={readOnly}
                    authAxios={authAxios}
                />
            </div>

            <ConfirmModal
                visible={!!targetTypeSwitchConfirm}
                className="target-type-confirm-modal"
                ModalTitle="Switch target type"
                ModalText={targetTypeSwitchConfirm?.message || ""}
                ModalTextAccept="OK"
                ModalTextClose="Cancel"
                onAccept={() => {
                    const nextType = targetTypeSwitchConfirm?.nextType;
                    setTargetTypeSwitchConfirm(null);
                    if (nextType) applyTargetTypeSwitch(nextType);
                }}
                onCloseConfirm={() => {
                    setTargetTypeSwitchConfirm(null);
                    setTargetTypeResetNonce((n) => n + 1);
                }}
            />
        </div>
    );
}
