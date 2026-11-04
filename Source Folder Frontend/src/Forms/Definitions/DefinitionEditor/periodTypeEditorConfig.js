import { apiClient } from "../../../utils/apiClient";
import { getApiBase } from "../../../globals";

export const PERIOD_LENGTH_MIN = 1;
export const PERIOD_LENGTH_MAX = 12;

const pick = (obj, key) => {
    const match = Object.keys(obj).find((k) => k.toLowerCase() === key.toLowerCase());
    return match !== undefined ? obj[match] : undefined;
};

/*
 * Editor config for the definitions shaped Name / Period Length / Remarks / Active
 * (Computation Type, Settlement Type). They differ only in endpoint and column names.
 *
 *   endpoint:  "CVRComputationTypes"
 *   column:    server column prefix + entity, e.g. "FRT_ComputationType" → FRT_ComputationTypeID / Name / PeriodLength
 *   dtoEntity: DTO property stem, e.g. "ComputationType" → ComputationTypeID / ComputationTypeName
 */
export function makePeriodTypeEditorConfig({ title, description, icon, exportName, nameLabel, namePlaceholder, endpoint, column, dtoEntity }) {
    const prefix = column.split("_")[0];
    const api = () => `${getApiBase()}/${endpoint}`;

    const fromServer = (x) => ({
        id: pick(x, `${column}ID`),
        values: {
            name: pick(x, `${column}Name`) ?? "",
            period: pick(x, `${prefix}_PeriodLength`) == null ? "" : String(pick(x, `${prefix}_PeriodLength`)),
            remarks: pick(x, `${prefix}_Remarks`) ?? "",
            active: !!pick(x, `${prefix}_Active`),
            // not editable here; kept so saving an existing row doesn't reset it
            isCustom: !!pick(x, `${prefix}_IsCustom`),
        },
    });

    const toDto = (values, id) => ({
        [`${dtoEntity}ID`]: id ?? null,
        [`${dtoEntity}Name`]: values.name.trim(),
        PeriodLength: Number(values.period),
        IsCustom: !!values.isCustom,
        Remarks: String(values.remarks ?? "").trim() || null,
        Active: !!values.active,
    });

    return {
        title,
        description,
        icon,
        exportName,
        fields: [
            {
                key: "name",
                label: nameLabel,
                type: "text",
                primary: true,
                required: true,
                unique: true,
                maxLength: 100,
                placeholder: namePlaceholder,
                width: "minmax(180px, 1.4fr)",
            },
            {
                key: "period",
                label: "Period (Months)",
                type: "number",
                required: true,
                maxLength: 2,
                placeholder: `${PERIOD_LENGTH_MIN} to ${PERIOD_LENGTH_MAX}`,
                validate: (v) => {
                    const n = Number(v);
                    return n >= PERIOD_LENGTH_MIN && n <= PERIOD_LENGTH_MAX
                        ? null
                        : `Period must be between ${PERIOD_LENGTH_MIN} and ${PERIOD_LENGTH_MAX} months.`;
                },
                width: "170px",
            },
            {
                key: "remarks",
                label: "Remarks",
                type: "text",
                maxLength: 500,
                placeholder: "Optional",
                width: "minmax(160px, 2fr)",
            },
            {
                key: "active",
                label: "Active",
                type: "switch",
                defaultValue: true,
                width: "64px",
            },
        ],

        load: async () => {
            const res = await apiClient.get(api());
            return (res.data ?? []).map(fromServer);
        },

        save: async ({ inserts, updates, deletes }) => {
            const res = await apiClient.post(`${api()}/save-changes`, {
                Inserts: inserts.map((v) => toDto(v, null)),
                Updates: updates.map((u) => toDto(u.values, u.id)),
                Deletes: deletes,
            });
            return (res.data ?? []).map(fromServer);
        },
    };
}
