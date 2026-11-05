import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import "./PlanWorkspaceAccordion.css";

/*
 * Collapsible card. The body slides open / closed (CSS grid-rows transition): it is mounted the
 * first time it opens and kept afterwards so closing can animate; it clips its content only
 * while moving, so dropdowns inside aren't cut off once it is open.
 */
export default function PlanWorkspaceAccordion({
    title,
    subtitle,
    defaultOpen = false,
    level = "primary",
    headerRight,
    openSignal = 0,
    // { n, open }: bumping n sets the section open / closed (expand all / collapse all)
    expandSignal = null,
    sectionId,
    children,
}) {
    const [open, setOpenState] = useState(defaultOpen);
    const [mounted, setMounted] = useState(defaultOpen);
    const [moving, setMoving] = useState(false);
    const levelClass = level === "nested" ? "plan-accordion--nested" : "";
    const openRef = useRef(defaultOpen);

    // open / moving / mounted change in the same render, so the section is never painted
    // "open and settled" (unclipped) while it is still 0px tall: that frame was a flicker
    const setOpen = useCallback((next) => {
        const value = typeof next === "function" ? next(openRef.current) : next;
        if (value === openRef.current) return;
        openRef.current = value;
        if (value) setMounted(true);
        setMoving(true);
        setOpenState(value);
    }, []);

    // bumping openSignal opens the section (e.g. jumping to an issue inside it)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { if (openSignal) setOpen(true); }, [openSignal]);
    useEffect(() => {
        if (expandSignal?.n) setOpen(!!expandSignal.open);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [expandSignal?.n]);

    // safety net: if no transitionend arrives (e.g. a background tab), stop "moving" anyway
    useEffect(() => {
        if (!moving) return undefined;
        const t = setTimeout(() => setMoving(false), 450);
        return () => clearTimeout(t);
    }, [moving]);

    return (
        <div className={`card border-0 shadow-sm mb-3 plan-accordion ${levelClass}`} data-issue-section={sectionId}>
            <div
                className="card-header bg-light border-0 d-flex justify-content-between align-items-center plan-accordion-header"
                role="button"
                tabIndex={0}
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
                onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((v) => !v); }
                }}
            >
                <div className="flex-grow-1 min-width-0">
                    <strong>{title}</strong>
                    {subtitle && <div className="text-muted small">{subtitle}</div>}
                </div>
                {headerRight && (
                    <div className="ms-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                        {headerRight}
                    </div>
                )}
                <span className={`ms-2 flex-shrink-0 plan-accordion-chevron${open ? " is-open" : ""}`} aria-hidden="true">
                    <ChevronDown size={16} />
                </span>
            </div>
            <div
                className={`plan-accordion-collapse${open ? " is-open" : ""}${moving ? " is-moving" : ""}`}
                onTransitionEnd={(e) => {
                    if (e.target !== e.currentTarget || e.propertyName !== "grid-template-rows") return;
                    setMoving(false);
                }}
                aria-hidden={!open}
            >
                <div className="plan-accordion-collapse-inner">
                    {mounted && (
                        <div className="card-body">
                            {children}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
