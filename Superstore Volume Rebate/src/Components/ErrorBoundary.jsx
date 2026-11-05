import React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import "../ui/ui.css";

/*
 * Catches render errors in a page so one bug shows a message instead of a blank app.
 * `resetKey` (the route) clears the error when the user navigates elsewhere.
 */
export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        // eslint-disable-next-line no-console
        console.error("Page crashed:", error, info?.componentStack);
    }

    componentDidUpdate(prevProps) {
        if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
            this.setState({ error: null });
        }
    }

    render() {
        if (!this.state.error) return this.props.children;
        return (
            <div style={{ padding: 32, display: "flex", justifyContent: "center" }}>
                <div style={{
                    maxWidth: 520, width: "100%", padding: 24, borderRadius: 12,
                    border: "1px solid var(--border-subtle, #e5e7eb)", background: "var(--surface-card, #fff)",
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, color: "var(--color-danger, #dc3545)" }}>
                        <AlertTriangle size={20} />
                        <strong>Something went wrong on this page</strong>
                    </div>
                    <p className="text-muted mb-3" style={{ fontSize: 14 }}>
                        Changes that weren't saved on this page may be lost. Reload the page to continue.
                    </p>
                    <pre style={{ fontSize: 12, whiteSpace: "pre-wrap", color: "var(--text-muted, #6a7282)", margin: "0 0 16px" }}>
                        {String(this.state.error?.message ?? this.state.error)}
                    </pre>
                    <button type="button" className="ds-btn ds-btn-primary" onClick={() => window.location.reload()}>
                        <RotateCcw size={16} /> Reload page
                    </button>
                </div>
            </div>
        );
    }
}
