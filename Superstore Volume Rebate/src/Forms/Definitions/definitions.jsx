import { useState } from "react";
import { Calculator, ChevronRight, FileText, Tags } from "lucide-react";
import DefinitionEditorModal from "./DefinitionEditor/DefinitionEditorModal";
import { vrTypeEditorConfig } from "./VR Types Definition/vrTypeEditorConfig";
import { computationTypeEditorConfig } from "./Computation Type/computationTypeEditorConfig";
import { settlementTypeEditorConfig } from "./Settlement Type/settlementTypeEditorConfig";
import "./definitions.css";

const DEFINITIONS = [
  {
    id: "volume-rebate-type",
    label: "Volume Rebate Type",
    description: "Define rebate type behavior and setup.",
    Icon: Tags,
    editor: vrTypeEditorConfig,
  },
  {
    id: "computation-type",
    label: "Computation Type",
    description: "Define monthly, quarterly, yearly, or custom computation cycles.",
    Icon: Calculator,
    editor: computationTypeEditorConfig,
  },
  {
    id: "settlement-type",
    label: "Settlement Type",
    description: "Define how and when rebate settlements are handled.",
    Icon: FileText,
    editor: settlementTypeEditorConfig,
  },
];

export default function DefinitionsPage() {
  const [openEditor, setOpenEditor] = useState(null);

  return (
    <div className="defs-page">
      <div className="d-flex justify-content-between align-items-start mb-3">
        <div><h5 className="mb-1">Definitions</h5></div>
      </div>
      <div className="defs-grid">
        {DEFINITIONS.map((item) => (
          <button key={item.id} type="button" className="defs-card" onClick={() => setOpenEditor(item.editor)}>
            <span className="defs-card-icon"><item.Icon size={22} /></span>
            <span className="defs-card-text">
              <span className="defs-card-title">{item.label}</span>
              <span className="defs-card-desc">{item.description}</span>
            </span>
            <ChevronRight size={18} className="defs-card-arrow" />
          </button>
        ))}
      </div>

      {openEditor && (
        <DefinitionEditorModal config={openEditor} onClose={() => setOpenEditor(null)} />
      )}
    </div>
  );
}
