import { Calculator } from "lucide-react";
import { makePeriodTypeEditorConfig } from "../DefinitionEditor/periodTypeEditorConfig";

export const computationTypeEditorConfig = makePeriodTypeEditorConfig({
    title: "Computation Types",
    description: "Define monthly, quarterly, yearly, or custom computation cycles.",
    icon: Calculator,
    exportName: "Computation Types",
    nameLabel: "Computation Type Name",
    namePlaceholder: "e.g. Quarterly",
    endpoint: "CVRComputationTypes",
    column: "FRT_ComputationType",
    dtoEntity: "ComputationType",
});
