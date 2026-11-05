import { FileText } from "lucide-react";
import { makePeriodTypeEditorConfig } from "../DefinitionEditor/periodTypeEditorConfig";

export const settlementTypeEditorConfig = makePeriodTypeEditorConfig({
    title: "Settlement Types",
    description: "Define how and when rebate settlements are handled.",
    icon: FileText,
    exportName: "Settlement Types",
    nameLabel: "Settlement Type Name",
    namePlaceholder: "e.g. Monthly",
    endpoint: "CVRSettlementTypes",
    column: "STT_SettlementType",
    dtoEntity: "SettlementType",
});
