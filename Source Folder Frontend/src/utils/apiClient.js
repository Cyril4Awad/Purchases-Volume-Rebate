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

export function apiErrorMessage(error, fallback = "Something went wrong. Try again.") {
    const data = error?.response?.data;
    if (typeof data === "string" && data.trim()) return data;
    if (data?.error) return data.error;
    // ASP.NET model validation: { title, errors: { "Inserts[0].PeriodLength": ["..."] } }
    const firstValidation = data?.errors && Object.values(data.errors).flat()[0];
    if (firstValidation) return firstValidation;
    if (data?.title) return data.title;
    if (!error?.response) return "Can't reach the server. Check your connection.";
    return fallback;
}
