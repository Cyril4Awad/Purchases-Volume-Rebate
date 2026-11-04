import { Tags } from "lucide-react";
import { apiClient } from "../../../utils/apiClient";
import { getApiBase } from "../../../globals";

const api = () => `${getApiBase()}/CVRTypes`;

const pick = (obj, key) => {
    const match = Object.keys(obj).find((k) => k.toLowerCase() === key.toLowerCase());
    return match !== undefined ? obj[match] : undefined;
};

const fromServer = (x) => ({
    id: pick(x, "VRT_TypeID"),
    values: {
        name: pick(x, "VRT_TypeName") ?? "",
        behavior: pick(x, "VRT_Behavior") ?? "",
        remarks: pick(x, "VRT_Remarks") ?? "",
        active: !!pick(x, "VRT_Active"),
    },
});

const toDto = (values, id) => ({
    TypeID: id ?? null,
    TypeName: values.name.trim(),
    Behavior: values.behavior,
    Remarks: values.remarks.trim() || null,
    Active: !!values.active,
});

export const vrTypeEditorConfig = {
    title: "Volume Rebate Types",
    description: "Define rebate type behavior and setup.",
    icon: Tags,
    exportName: "Volume Rebate Types",
    fields: [
        {
            key: "name",
            label: "Rebate Type Name",
            type: "text",
            primary: true,
            required: true,
            unique: true,
            maxLength: 100,
            placeholder: "e.g. Quarterly Volume",
            width: "minmax(180px, 1.4fr)",
        },
        {
            key: "behavior",
            label: "Behavior",
            type: "select",
            required: true,
            placeholder: "Select...",
            options: [
                { value: "M", label: "Manual" },
                { value: "A", label: "Automatic" },
            ],
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
