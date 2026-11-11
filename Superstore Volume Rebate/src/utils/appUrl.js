/**
 * Builds an absolute URL to a route inside this app, e.g. appUrl('/login')
 * -> http://server/brandvolumerebate/#/login
 *
 * With HashRouter the route lives after '#', so window.location.pathname is
 * always the IIS app folder the app is deployed under. Works for any deploy
 * path without hardcoding it.
 *
 * Use only when a full page load is needed (e.g. clearing in-memory state on
 * logout) or for plain <a href>. Inside React, prefer navigate('/route').
 */
export function appUrl(route = "/") {
    const base = window.location.pathname.replace(/index\.html$/i, "");
    const path = route.startsWith("/") ? route : `/${route}`;
    return `${window.location.origin}${base}#${path}`;
}
