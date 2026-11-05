// Pure helpers for DefinitionEditorModal. Values are compared after normalising
// (trimmed text, booleans), so editing a value and typing it back is not a change.
//
// The primary field (the name) decides whether a row exists: while it's blank the
// row is empty, its other fields are locked and reset, and an existing row is
// deleted on save. Once it has a value, every required field is required.

export function normalize(field, value) {
    if (field.type === "switch") return !!value;
    return String(value ?? "").trim();
}

export function primaryField(fields) {
    return fields.find((f) => f.primary) || fields.find((f) => f.type === "text") || fields[0];
}

export function blankValues(fields) {
    const values = {};
    fields.forEach((f) => {
        values[f.key] = f.type === "switch" ? (f.defaultValue ?? true) : "";
    });
    return values;
}

export function isRowEmpty(values, fields) {
    const primary = primaryField(fields);
    return normalize(primary, values[primary.key]) === "";
}

// Setting a field's value; clearing the primary field resets the rest of the row.
// Keys that aren't editor fields (e.g. hidden server flags) are kept.
export function withValue(values, key, value, fields) {
    const primary = primaryField(fields);
    if (key === primary.key && String(value ?? "").trim() === "") {
        return { ...values, ...blankValues(fields), [key]: value };
    }
    return { ...values, [key]: value };
}

export function missingRequired(values, fields) {
    return fields.filter((f) => f.required && normalize(f, values[f.key]) === "");
}

// First rule violation among filled-in fields, e.g. "Period Length must be between 1 and 12."
export function invalidField(values, fields) {
    for (const f of fields) {
        if (!f.validate) continue;
        const v = normalize(f, values[f.key]);
        if (v === "") continue;
        const message = f.validate(v);
        if (message) return { field: f, message };
    }
    return null;
}

export function changedFields(values, original, fields) {
    const changed = new Set();
    if (!original) return changed;
    fields.forEach((f) => {
        if (normalize(f, values[f.key]) !== normalize(f, original[f.key])) changed.add(f.key);
    });
    return changed;
}

/**
 * "blank"  new row, no name                → ignored on save
 * "new"    new row with a name             → insert
 * "clean"  existing row, unchanged
 * "edited" existing row, changed           → update
 * "delete" existing row, name cleared      → delete
 */
export function rowState(row, originals, fields) {
    const empty = isRowEmpty(row.values, fields);
    if (row.id == null) return empty ? "blank" : "new";
    if (empty) return "delete";
    return changedFields(row.values, originals.get(row.id), fields).size > 0 ? "edited" : "clean";
}

// Row ids (rid) whose unique fields clash, case-insensitively, among non-empty rows.
export function duplicateRowIds(rows, fields) {
    const result = new Set();
    fields.filter((f) => f.unique).forEach((f) => {
        const seen = new Map();
        rows.forEach((r) => {
            if (isRowEmpty(r.values, fields)) return;
            const key = normalize(f, r.values[f.key]).toLowerCase();
            if (!key) return;
            if (seen.has(key)) {
                result.add(seen.get(key));
                result.add(r.rid);
            } else {
                seen.set(key, r.rid);
            }
        });
    });
    return result;
}
