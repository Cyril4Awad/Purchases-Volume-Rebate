# Superstore Volume Rebate

Purchase-side (supplier) volume rebates for SuperStore, ported from the ERP sales volume rebate.

| Folder | What |
| --- | --- |
| `Superstore Volume Rebate Backend` | ASP.NET Core API: `API` (authentication), `Main` (volume rebate), `DataService` (DAL + engines) |
| `Superstore Volume Rebate` | React app |
| `SQL Scripts` | `SuperStore - Create CVR Tables.sql` creates the CVR_* tables on the SuperStore database |

## Setup

1. Run `SQL Scripts/SuperStore - Create CVR Tables.sql` on the SuperStore database.
2. Copy `appsettings.example.json` to `appsettings.json` in `Superstore Volume Rebate Backend/API` and
   `Superstore Volume Rebate Backend/Main`, then fill in the connection string, the JWT key and `Location`
   (the SuperStore location code, e.g. `01`). The real `appsettings.json` files are not committed.
3. Frontend: `npm install` then `npm start` in `Superstore Volume Rebate`.

Suppliers are identified by `Sup_Code` + `Sup_Loc` (`tbl_Suppliers` primary key); the location is
the configured `Location`.
