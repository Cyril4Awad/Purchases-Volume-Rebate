# Sales Volume Rebate  Deployment Guide

## 1. Prerequisites (if not installed)
- **.NET 8 Hosting Bundle**: dotnet.microsoft.com/download/dotnet/8.0 → ASP.NET Core Runtime 8.0.x → Hosting Bundle → install → cmd as administrator `iisreset`
- **IIS URL Rewrite Module** 

## 2. Database
Run `Create_Table_Scripts.sql` against the client's **existing** main DB. Do not create a new database.

## 3. Files
```
C:\PublishIIS\
    Authentication\
    Main\
    Frontend\
```
Copy each deployment-package folder into the matching path.

## 4. Backend config
Both APIs point to the same DB. Same `Jwt` block in **both** files (must match exactly).

**`Authentication\appsettings.json`** and **`Main\appsettings.json`**  replace in all connection strings:
- `SERVER_IP` → SQL host/IP (`localhost` if local)
- `CLIENT_DB_NAME` → client's existing DB (same for all 3 in Main)
- `SQL_PASSWORD` → SA password

`Main` has 3 conn strings (`Constr`, `ClientsConstr`, `StockConstr`)  all identical, same DB.

## 5. Frontend config
`Frontend\config.json`:
```json
{
  "AUTH_BASE": "http://SERVER_IP:50001/api",
  "API_BASE": "http://SERVER_IP:50002/api"
}
```

## 6. IIS sites
| Site | Path | Port |
|---|---|---|
| Authentication | `C:\PublishIIS\Authentication\` | 50001 |
| Main | `C:\PublishIIS\Main\` | 50002 |
| SVR (Frontend) | `C:\PublishIIS\Frontend\` | 80 |

Stop **Default Web Site** first if port 80 is in use.

## 7. App pools
All 3 pools (`Authentication`, `Main`, `SVR`) → **.NET CLR Version: No Managed Code**.

## 8. Verify
`http://SERVER_IP/#/volumerebate` (or `localhost`)

## Troubleshooting
| Symptom | Cause | Fix |
|---|---|---|
| Blank white page | Stale service worker cache | Incognito, or clear site data in DevTools |
| 500.19 | Hosting Bundle missing | Install per Step 1, `iisreset` |
| CORS error | Backend sites down | Confirm both API sites started, pools = No Managed Code |
| Login fails | JWT mismatch | `Jwt` block must be identical in both `appsettings.json` |
| No clients loading | Wrong DB name | Verify `CLIENT_DB_NAME` in both `appsettings.json` |
| No redirect on refresh | URL Rewrite missing | Install IIS URL Rewrite Module (Step 1) |