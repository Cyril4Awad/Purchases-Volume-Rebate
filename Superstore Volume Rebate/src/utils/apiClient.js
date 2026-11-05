import axios from "axios";
import { triggerSessionExpired } from "./sessionExpired";
import { updateTokenFromResponse } from "./updateTokenFromResponse";

// Axios instance for design-system screens. Unlike the global axios interceptors,
// it returns the raw response and keeps the server's error body so we can show
// its message ({ error: "..." } from GlobalExceptionFilter).
export const apiClient = axios.create({
    headers: { "Content-Type": "application/json" },
});

apiClient.interceptors.request.use((config) => {
    const token = localStorage.getItem("token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

apiClient.interceptors.response.use(
    (response) => {
        updateTokenFromResponse(response);
        return response;
    },
    (error) => {
        if (error?.response?.status === 401) triggerSessionExpired();
        return Promise.reject(error);
    }
);

const looksLikeHtml = (text) => /^\s*<(!doctype|html)/i.test(text);

// IIS / ASP.NET Core error pages come back as full HTML documents. Turn them into one readable line.
function htmlErrorMessage(html, status) {
    const title = (html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim();
    if (/500\.30|500\.3\d|failed to start/i.test(title)) {
        return "The server application failed to start. Please contact support.";
    }
    if (status === 404) return "The server address was not found. Check the API URL in config.json.";
    if (status === 503) return "The server is unavailable right now. Try again in a moment.";
    return title
        ? `Server error: ${title}`
        : `The server returned an error${status ? ` (${status})` : ""}. Please contact support.`;
}

export function apiErrorMessage(error, fallback = "Something went wrong. Try again.") {
    const data = error?.response?.data;
    if (typeof data === "string" && looksLikeHtml(data)) return htmlErrorMessage(data, error?.response?.status);
    if (typeof data === "string" && data.trim()) return data;
    if (data?.error) return data.error;
    // ASP.NET model validation: { title, errors: { "Inserts[0].PeriodLength": ["..."] } }
    const firstValidation = data?.errors && Object.values(data.errors).flat()[0];
    if (firstValidation) return firstValidation;
    if (data?.title) return data.title;
    if (!error?.response) return "Can't reach the server. Check your connection.";
    return fallback;
}
