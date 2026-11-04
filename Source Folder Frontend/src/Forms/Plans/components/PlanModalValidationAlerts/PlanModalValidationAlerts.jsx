import { useEffect, useRef } from "react";
import { useToaster } from "../../../../ui/toast/Toaster";

const MAX_SHOWN = 3;

/**
 * Validation errors as side error toasts (Sales Volume Rebate reference) instead of an
 * inline banner. Each new list of errors is announced once: the first few as their own
 * toasts, the rest summarised.
 */
export function useValidationToasts(errors, { summarize = false } = {}) {
    const toast = useToaster();
    const lastKey = useRef("");

    useEffect(() => {
        const list = (errors ?? []).filter(Boolean);
        const key = list.join("\u0001");
        if (key === lastKey.current) return;
        lastKey.current = key;
        if (!list.length) return;
        if (summarize && list.length > 1) {
            // the full list lives in the modal footer ("N issues to fix")
            toast.error(`${list.length} issues to fix. Open the list at the bottom of the window.`);
            return;
        }
        list.slice(0, MAX_SHOWN).forEach((e) => toast.error(e));
        if (list.length > MAX_SHOWN) {
            const more = list.length - MAX_SHOWN;
            toast.error(`${more} more ${more === 1 ? "issue" : "issues"} to fix.`);
        }
    }, [errors, toast, summarize]);
}

export default function PlanModalValidationAlerts({ errors = [], summarize = false }) {
    useValidationToasts(errors, { summarize });
    return null;
}

/** Section a validation message belongs to, for the footer issues list. */
export function issueSection(message) {
    const m = String(message ?? "");
    if (/^Target "|^Each target|target/i.test(m)) return "Targets";
    if (/fee/i.test(m)) return "Fees";
    return "Contract";
}
