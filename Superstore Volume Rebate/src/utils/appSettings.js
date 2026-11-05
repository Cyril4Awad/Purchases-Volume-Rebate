import { apiClient } from "./apiClient";
import { getApiBase } from "../globals";

/* ---------- Company logo for the Excel exports ----------
 * SuperStore keeps it in COm_Logo.L_Img (GET /api/Company/logo, 204 when empty).
 * When there is none, the app's own logo is used so exports stay branded. */

let logoPromise = null;

const FALLBACK_LOGO = `${process.env.PUBLIC_URL || ""}/img/brandlogo.png`;

export function loadCompanyLogo() {
    logoPromise ??= apiClient.get(`${getApiBase()}/Company/logo`, { responseType: "blob" })
        .then(({ data, status }) => (status === 204 || !data?.size ? fetchFallback() : toPng(data)))
        .catch(() => fetchFallback())
        .then((logo) => { if (!logo) logoPromise = null; return logo; });
    return logoPromise;
}

function fetchFallback() {
    return fetch(FALLBACK_LOGO)
        .then((r) => (r.ok ? r.blob() : null))
        .then((blob) => (blob ? toPng(blob) : null))
        .catch(() => null);
}

/* ---------- Company name for printed reports ---------- */

let companyPromise = null;

export function loadCompanyName() {
    companyPromise ??= apiClient.get(`${getApiBase()}/Company/info`)
        .then(({ data }) => String(data?.comp_Name ?? data?.Comp_Name ?? "").trim())
        .catch(() => { companyPromise = null; return ""; });
    return companyPromise;
}

function toPng(blob) {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            canvas.getContext("2d").drawImage(img, 0, 0);
            URL.revokeObjectURL(url);
            resolve({ dataUrl: canvas.toDataURL("image/png"), width: img.naturalWidth, height: img.naturalHeight });
        };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
        img.src = url;
    });
}
