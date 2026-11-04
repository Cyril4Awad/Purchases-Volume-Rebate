/**
 * Deep copy of a plan / contract draft. Same result as JSON.parse(JSON.stringify(x))
 * (dates become strings, undefined is dropped) except that File / Blob values (the
 * contract's attached PDF) are kept as-is instead of turning into {} and being lost.
 */
export default function cloneDraft(value) {
    if (value === undefined) return undefined;
    const blobs = [];
    const json = JSON.stringify(value, function replacer(key, v) {
        const raw = this[key];
        if (typeof Blob !== "undefined" && raw instanceof Blob) {
            blobs.push(raw);
            return { __cloneDraftBlob__: blobs.length - 1 };
        }
        return v;
    });
    if (!blobs.length) return JSON.parse(json);
    return JSON.parse(json, (key, v) =>
        v && typeof v === "object" && Object.keys(v).length === 1 && "__cloneDraftBlob__" in v
            ? blobs[v.__cloneDraftBlob__]
            : v
    );
}
