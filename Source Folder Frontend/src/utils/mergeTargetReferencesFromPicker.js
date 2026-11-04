/**

 * Builds target reference rows from the picker selection, reusing DB ids from

 * existing rows that match the same reference type + stock/group key.

 */



function stockDisplayFields(item, prior, getProp) {

    return {

        stkRef: getProp(item, "STK_REF") ?? prior?.stkRef,

        stkDesc: getProp(item, "STK_DESC") ?? prior?.stkDesc,

        dbarBarcode: getProp(item, "DBAR_BARCODE") ?? prior?.dbarBarcode,

        stkUnit: getProp(item, "STK_UNIT") ?? prior?.stkUnit,

        itCode: undefined,

        itDesc: undefined,

        grpCode: undefined,

        grpDesc: undefined,

    };

}



function groupDisplayFields(item, prior, getProp) {

    return {

        stkRef: undefined,

        stkDesc: undefined,

        dbarBarcode: undefined,

        stkUnit: undefined,

        itCode: getProp(item, "IT_CODE") ?? prior?.itCode,

        itDesc: getProp(item, "IT_DESC") ?? prior?.itDesc,

        grpCode: getProp(item, "GRP_CODE") ?? prior?.grpCode,

        grpDesc: getProp(item, "GRP_DESC") ?? prior?.grpDesc,

    };

}



export function mergeTargetReferencesFromPicker({

    refType,

    pendingSelectedIds,

    lookupRows,

    existingOfType,

    getProp,

}) {

    const idKey = refType === "StockItem" ? "STK_RECID" : "IT_RECID";

    const codeKey = refType === "StockItem" ? "STK_REF" : "IT_CODE";

    const descKey = refType === "StockItem" ? "STK_DESC" : "IT_DESC";



    // Index once: the picker can hand over the whole catalogue ("Add all", ~30k items), and a
    // .find() per id over every row made that quadratic (minutes, frozen tab).
    const priorById = new Map();
    (existingOfType ?? []).forEach((r) => {
        const pid = Number(refType === "StockItem" ? r.stkRecId : r.itemTypeRecId);
        if (pid && !priorById.has(pid)) priorById.set(pid, r);
    });
    const rowById = new Map();
    (lookupRows ?? []).forEach((d) => {
        const rid = Number(getProp(d, idKey));
        if (rid && !rowById.has(rid)) rowById.set(rid, d);
    });

    return pendingSelectedIds.map((rawId) => {
        const id = Number(rawId);
        const prior = priorById.get(id);
        const item = rowById.get(id);
        const displayFields =
            refType === "StockItem"
                ? stockDisplayFields(item, prior, getProp)
                : groupDisplayFields(item, prior, getProp);

        return {
            targetReferenceId: prior?.targetReferenceId ?? null,
            referenceType: refType,
            stkRecId: refType === "StockItem" ? id : null,
            itemTypeRecId: refType === "ProductGroup" ? id : null,
            label: item
                ? `${getProp(item, codeKey) || ""} - ${getProp(item, descKey) || ""}`
                : prior?.label ?? `#${id}`,
            ...displayFields,
        };
    });
}

