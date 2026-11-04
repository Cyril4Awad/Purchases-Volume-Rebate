// Settlement payment API hook for the computation workspace.
import { useCallback, useState } from "react";
import { getApiBase } from "../../../globals";
import { normalizeSettlementPayments } from "../../../utils/settlementPaymentLogic";
import { supplierCode } from "../../../utils/contractWorkspaceMappers";

const supplierCodes = (list) => [...new Set((list ?? []).map(supplierCode).filter(Boolean))];
export function useSettlementPayments(authAxios) {
    const [payments, setPayments] = useState([]);
    const [loadingPayments, setLoadingPayments] = useState(false);
    const [processing, setProcessing] = useState(false);

    const loadPayments = useCallback(async (planId) => {
        const id = Number(planId);
        if (!Number.isFinite(id) || id <= 0 || !authAxios) {
            setPayments([]);
            return [];
        }

        setLoadingPayments(true);
        try {
            const { data } = await authAxios.get(`${getApiBase()}/CVRSettlementPayments`, {
                params: { planId: id },
            });
            const normalized = normalizeSettlementPayments(data);
            setPayments(normalized);
            return normalized;
        } catch {
            setPayments([]);
            return [];
        } finally {
            setLoadingPayments(false);
        }
    }, [authAxios]);

    const resetPayments = useCallback(() => {
        setPayments([]);
        setLoadingPayments(false);
        setProcessing(false);
    }, []);

    const processTarget = useCallback(async ({ targetId, clientIds }) => {
        if (!authAxios) throw new Error("authAxios is required");
        setProcessing(true);
        try {
            const { data } = await authAxios.post(`${getApiBase()}/CVRSettlementPayments/process-target`, {
                targetId: Number(targetId),
                supCodes: supplierCodes(clientIds),
            });
            return data;
        } finally {
            setProcessing(false);
        }
    }, [authAxios]);

    const processFeesBatch = useCallback(async ({ clientIds, feeIds }) => {
        if (!authAxios) throw new Error("authAxios is required");
        setProcessing(true);
        try {
            const { data } = await authAxios.post(`${getApiBase()}/CVRSettlementPayments/process-fees-batch`, {
                supCodes: supplierCodes(clientIds),
                feeIds: (feeIds ?? []).map(Number).filter((n) => n > 0),
            });
            return data;
        } finally {
            setProcessing(false);
        }
    }, [authAxios]);

    return {
        payments,
        loadingPayments,
        processing,
        loadPayments,
        resetPayments,
        processTarget,
        processFeesBatch,
    };
}
