import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import "./toast.css";

export const TOAST_DURATION = 3500;
const MAX_TOASTS = 4;

const ICONS = {
    success: CheckCircle2,
    error: XCircle,
    warning: AlertTriangle,
    info: Info,
};

const ToasterContext = createContext(null);

/*
 * Side toasts. A toast repeated while still visible doesn't stack: its counter
 * goes up and its 3.5s timer restarts.
 */
export function ToasterProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const nextId = useRef(1);

    const dismiss = useCallback((id) => {
        setToasts((list) => list.filter((t) => t.id !== id));
    }, []);

    const show = useCallback((type, message) => {
        const key = `${type}:${message}`;
        setToasts((list) => {
            const existing = list.find((t) => t.key === key);
            if (existing) {
                return list.map((t) =>
                    t.key === key ? { ...t, count: t.count + 1, stamp: Date.now() } : t
                );
            }
            const toast = { id: nextId.current++, key, type, message, count: 1, stamp: Date.now() };
            return [...list, toast].slice(-MAX_TOASTS);
        });
    }, []);

    const api = useMemo(() => ({
        show,
        success: (message) => show("success", message),
        error: (message) => show("error", message),
        warning: (message) => show("warning", message),
        info: (message) => show("info", message),
        dismiss,
    }), [show, dismiss]);

    return (
        <ToasterContext.Provider value={api}>
            {children}
            {createPortal(
                <div className="ds-toaster" role="region" aria-label="Notifications">
                    {toasts.map((t) => <ToastItem key={t.id} toast={t} onDismiss={dismiss} />)}
                </div>,
                document.body
            )}
        </ToasterContext.Provider>
    );
}

function ToastItem({ toast, onDismiss }) {
    const { id, type, message, count, stamp } = toast;
    const Icon = ICONS[type] || Info;

    useEffect(() => {
        const timer = setTimeout(() => onDismiss(id), TOAST_DURATION);
        return () => clearTimeout(timer);
    }, [id, stamp, onDismiss]);

    return (
        <div className={`ds-toast is-${type}`} role={type === "error" ? "alert" : "status"}>
            <span className="ds-toast-icon"><Icon size={18} /></span>
            <div className="ds-toast-body">
                {count > 1 && <span className="ds-toast-count" key={count}>{count}</span>}
                <span className="ds-toast-message">{message}</span>
            </div>
            <button type="button" className="ds-toast-close" onClick={() => onDismiss(id)} aria-label="Dismiss">
                <X size={14} />
            </button>
            {/* keyed by stamp so the bar restarts whenever the toast repeats */}
            <span
                key={stamp}
                className="ds-toast-timer"
                style={{ animationDuration: `${TOAST_DURATION}ms` }}
            />
        </div>
    );
}

export function useToaster() {
    const ctx = useContext(ToasterContext);
    if (!ctx) throw new Error("useToaster must be used inside <ToasterProvider>");
    return ctx;
}
