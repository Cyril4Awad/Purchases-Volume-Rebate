import React from "react";

/** Two-or-more option toggle (from the Sales Volume Rebate reference). Styles: ui/ui.css .ds-segmented */
export default function Segmented({ value, options, onChange, disabled, size, invalid }) {
    return (
        <div className={`ds-segmented${size === "sm" ? " is-sm" : ""}${invalid ? " is-invalid" : ""}`} role="radiogroup">
            {options.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={value === o.value}
                    className={value === o.value ? "is-active" : ""}
                    onClick={() => onChange(o.value)}
                    disabled={disabled}
                >
                    {o.icon}
                    {o.label}
                </button>
            ))}
        </div>
    );
}
