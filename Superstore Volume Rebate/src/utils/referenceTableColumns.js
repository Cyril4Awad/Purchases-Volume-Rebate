import React from "react";
import { Trash2 } from "lucide-react";

import { mobileActionRow, mobileDualCell, mobileLabeledRow } from "./mobileTableCells";



const display = (v) => (v != null && v !== "" ? v : "");

const newRowStyle = { backgroundColor: "#d1e7dd" };

const isNew = (row) => row.targetReferenceId == null;



const cell = (content, row, center = false) => (

    <div

        className={`w-100 h-100 d-flex align-items-center px-2${center ? " justify-content-center text-center" : ""}`}

        style={isNew(row) ? newRowStyle : undefined}

    >

        {content}

    </div>

);



const labeledCell = (label, value, row, center = false) => {

    const content = mobileDualCell(display(value), mobileLabeledRow(label, display(value)));

    return cell(content, row, center);

};



export function buildProductGroupColumns({ onRemove }) {

    return [

        {

            Header: "Category Code",

            accessor: "itCode",

            width: 110,

            Cell: (c) => labeledCell("Category Code", c.original.itCode, c.original, true),

        },

        {

            Header: "Category Description",

            accessor: "itDesc",

            minWidth: 220,

            Cell: (c) => labeledCell("Category Description", c.original.itDesc, c.original),

        },

        {

            Header: "",

            accessor: "targetReferenceId",

            width: 88,

            Cell: (c) => (

                <div

                    className="w-100 h-100 d-flex align-items-center justify-content-center px-2"

                    style={isNew(c.original) ? newRowStyle : undefined}

                >

                    {mobileActionRow(

                        <button
                            type="button"
                            className="ds-btn ds-btn-icon"
                            onClick={() => onRemove(c.original)}
                            aria-label="Remove"
                            title="Remove"
                        >
                            <Trash2 size={16} />
                        </button>

                    )}

                </div>

            ),

        },

    ];

}



export function buildStockItemColumns({ onRemove }) {

    return [

        {

            Header: "Reference",

            accessor: "stkRef",

            width: 120,

            Cell: (c) => labeledCell("Reference", c.original.stkRef, c.original, true),

        },

        {

            Header: "Description",

            accessor: "stkDesc",

            minWidth: 180,

            Cell: (c) => labeledCell("Description", c.original.stkDesc, c.original),

        },

        {

            Header: "Barcode",

            accessor: "dbarBarcode",

            width: 130,

            Cell: (c) => labeledCell("Barcode", c.original.dbarBarcode, c.original),

        },

        {

            Header: "Unit",

            accessor: "stkUnit",

            width: 72,

            Cell: (c) => labeledCell("Unit", c.original.stkUnit, c.original, true),

        },

        {

            Header: "",

            accessor: "targetReferenceId",

            width: 88,

            Cell: (c) => (

                <div

                    className="w-100 h-100 d-flex align-items-center justify-content-center px-2"

                    style={isNew(c.original) ? newRowStyle : undefined}

                >

                    {mobileActionRow(

                        <button
                            type="button"
                            className="ds-btn ds-btn-icon"
                            onClick={() => onRemove(c.original)}
                            aria-label="Remove"
                            title="Remove"
                        >
                            <Trash2 size={16} />
                        </button>

                    )}

                </div>

            ),

        },

    ];

}



export function buildUnifiedReferenceColumns({ onRemove }) {

    return buildStockItemColumns({ onRemove });

}

