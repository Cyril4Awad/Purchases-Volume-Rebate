import { supplierCode } from "./contractWorkspaceMappers";
export function getSimulationPreCheckErrors() {
    return [];
}

export function buildResolvedFromPlanDraft(draft, { settlementTypeOptions = [] } = {}) {
    const cd = draft?.contractDraft;
    if (!cd) return { error: "Contract is required" };

    // suppliers are identified by Sup_Code (the location is the API's configured one)
    const mainClientId = supplierCode(cd.ClientID);
    if (!mainClientId) {
        return { error: "Main supplier is required" };
    }

    const subClientIds = (cd.SubClients ?? [])
        .map((sc) => supplierCode(sc?.ClientID))
        .filter(Boolean);

    const allClientIds = [...new Set([mainClientId, ...subClientIds])];

    const contractCurrency =
        cd.contractCurrency?.value
        ?? cd.contractCurrency?.label
        ?? cd.contractCurrency
        ?? null;

    return {
        contract: cd,
        contractCurrency: contractCurrency ? String(contractCurrency).trim().toUpperCase() : null,
        plan: draft.plan ?? {},
        targets: draft.targets ?? [],
        fees: draft.fees ?? [],
        settlementTypeOptions,
        mainClientId,
        allClientIds,
        clientRole: "Master Supplier",
    };
}
