import { useValidationToasts } from "../../Plans/components/PlanModalValidationAlerts/PlanModalValidationAlerts";

/** Validation errors as side error toasts (Sales Volume Rebate reference). */
export default function ContractModalValidationAlerts({ errors = [] }) {
    useValidationToasts(errors);
    return null;
}
