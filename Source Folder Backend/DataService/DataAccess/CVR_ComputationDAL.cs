using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Dapper;
using DataService.Models;
using DataService.Models.DTOs;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;


/// <summary>
/// Purchase data source for the volume-rebate engine (SuperStore).
///
/// Total purchases per supplier = Normal PI (Pih_Type 'N') − Return PI (Pih_Type 'R'),
/// VAT included, only stock-updated invoices (Pih_StkUpdate IS NOT NULL) and excluding
/// invoices that were reversed (a matching Pih_Type 'X' exists for the same reference).
/// Line value = Qty × UCost × (1 − UDisc%) × (1 − header AddDisc%) + VAT × (1 − AddDisc%);
/// promotion ('P') and free ('R') entries are not charged (amount 0, quantity still counted).
///
/// Output column names (SalesAmountUSD, NetSalUSD …) are kept from the ERP sales version on
/// purpose so the computation engine and UI keep working unchanged: "Sal" = purchases,
/// "Ret" = purchase returns. Suppliers are identified by Sup_Code at the configured location.
/// </summary>
public class CVRComputationDAL
{
    private readonly IConfiguration _config;
    private readonly string _loc;

    // ── Stock pool / reference display (items + categories) ─────────────────────────────────

    private static readonly string CategoryCodeOfRef = SuperStoreKeys.SqlCodeExpression("tr.TRF_ProductGroupID");

    private static readonly string StockPoolSql = $@"
SELECT TRF_StockItemID AS StkRecId
FROM CVR_TargetReferences
WHERE TRF_TargetID = @TargetId
  AND TRF_ScopeType IN ('SI', 'S')
  AND TRF_StockItemID IS NOT NULL

UNION

SELECT s.Stk_StkId
FROM CVR_TargetReferences tr
INNER JOIN dbo.tbl_StockItm s ON s.Stk_Loc = @Loc AND s.Stk_Category = {CategoryCodeOfRef}
WHERE tr.TRF_TargetID = @TargetId
  AND tr.TRF_ScopeType IN ('PG', 'P')
  AND tr.TRF_ProductGroupID IS NOT NULL";

    private static readonly string StockPoolBatchSql = $@"
SELECT TRF_TargetID AS TargetId, TRF_StockItemID AS StkRecId
FROM CVR_TargetReferences
WHERE TRF_TargetID IN @TargetIds
  AND TRF_ScopeType IN ('SI', 'S')
  AND TRF_StockItemID IS NOT NULL

UNION

SELECT tr.TRF_TargetID AS TargetId, s.Stk_StkId AS StkRecId
FROM CVR_TargetReferences tr
INNER JOIN dbo.tbl_StockItm s ON s.Stk_Loc = @Loc AND s.Stk_Category = {CategoryCodeOfRef}
WHERE tr.TRF_TargetID IN @TargetIds
  AND tr.TRF_ScopeType IN ('PG', 'P')
  AND tr.TRF_ProductGroupID IS NOT NULL";

    private static readonly string ReferenceDisplayJoins = $@"
LEFT JOIN dbo.tbl_StockItm  s ON s.Stk_Loc = @Loc AND s.Stk_StkId = tr.TRF_StockItemID
LEFT JOIN dbo.tbl_Categories c ON c.Cat_Loc = @Loc AND tr.TRF_ProductGroupID IS NOT NULL
                              AND c.Cat_Code = {CategoryCodeOfRef}";

    private static readonly string TargetReferencesDisplaySql = $@"
SELECT
    tr.TRF_ScopeType                                                        AS ScopeType,
    COALESCE(s.Stk_Supplier + '/' + s.Stk_Category + '/' + s.Stk_Serial, c.Cat_Code) AS Code,
    COALESCE(s.Stk_Desc, c.Cat_Desc)                                        AS Description
FROM CVR_TargetReferences tr
{ReferenceDisplayJoins}
WHERE tr.TRF_TargetID = @TargetId";

    private static readonly string TargetReferencesDisplayBatchSql = $@"
SELECT
    tr.TRF_TargetID                                                         AS TargetId,
    tr.TRF_ScopeType                                                        AS ScopeType,
    COALESCE(s.Stk_Supplier + '/' + s.Stk_Category + '/' + s.Stk_Serial, c.Cat_Code) AS Code,
    COALESCE(s.Stk_Desc, c.Cat_Desc)                                        AS Description
FROM CVR_TargetReferences tr
{ReferenceDisplayJoins}
WHERE tr.TRF_TargetID IN @TargetIds";

    // ── Purchase lines ──────────────────────────────────────────────────────────────────────

    /// <summary>
    /// FROM/WHERE block producing one row per purchase-invoice line with the columns
    /// line.NetCur (invoice currency), amounts.AmtUSD and amounts.AmtLBP.
    /// </summary>
    private static string PurchaseLinesFrom(
        bool scoped, string fromParam, string toParam, bool inclusiveTo = false, string extraJoin = "")
    {
        var dateFilter = inclusiveTo
            ? $"CAST(h.Pih_PIdate AS date) BETWEEN {fromParam} AND {toParam}"
            : $"CAST(h.Pih_PIdate AS date) >= {fromParam} AND CAST(h.Pih_PIdate AS date) < {toParam}";

        return $@"
    FROM dbo.tbl_PurInvHeader h
    INNER JOIN dbo.tbl_PurInvDetails d
        ON d.Pid_Loc = h.Pih_Loc
       AND d.Pid_Reference = h.Pih_Reference
       AND d.Pid_Type = h.Pih_Type{(scoped ? @"
    INNER JOIN #StockFilter sf ON sf.StkId = d.Pid_StkId" : "")}
    CROSS APPLY (
        SELECT
            CASE WHEN d.Pid_Entry IN ('P', 'R') THEN 0
                 ELSE ISNULL(d.Pid_PurQty, 0) * ISNULL(d.Pid_UCost, 0)
                        * (1 - ISNULL(d.Pid_UDisc, 0) / 100.0)
                        * (1 - ISNULL(h.Pih_AddDisc, 0) / 100.0)
                    + CASE WHEN d.Pid_Entry IN ('N', 'C')
                           THEN ISNULL(d.Pid_VatAmt, 0) * (1 - ISNULL(h.Pih_AddDisc, 0) / 100.0)
                           ELSE 0 END
            END AS NetCur
    ) line
    OUTER APPLY (
        SELECT TOP 1 dr.DR_Rate1LC AS Rate, dr.DR_Op1LC AS Op
        FROM dbo.Com_DailyRate dr
        WHERE h.Pih_Curr NOT IN ('$', 'LL')
          AND dr.DR_CurCode = h.Pih_Curr
          AND dr.DR_Date <= h.Pih_PIdate
        ORDER BY dr.DR_Date DESC
    ) fx
    CROSS APPLY (
        SELECT
            CASE WHEN h.Pih_Curr = 'LL' THEN line.NetCur
                 WHEN h.Pih_Curr = '$'  THEN line.NetCur * ISNULL(h.Pih_RateCC, 0)
                 WHEN fx.Op = '/'       THEN line.NetCur / NULLIF(fx.Rate, 0)
                 ELSE line.NetCur * ISNULL(fx.Rate, 0)
            END AS AmtLBP
    ) lbp
    CROSS APPLY (
        SELECT
            CAST(CASE WHEN h.Pih_Curr = '$' THEN line.NetCur
                      ELSE ISNULL(lbp.AmtLBP / NULLIF(h.Pih_RateCC, 0), 0) END AS decimal(18, 3)) AS AmtUSD,
            CAST(ISNULL(lbp.AmtLBP, 0) AS decimal(18, 3)) AS AmtLBP
    ) amounts
    {extraJoin}
    WHERE h.Pih_Loc = @Loc
      AND h.Pih_Type IN ('N', 'R')
      AND h.Pih_StkUpdate IS NOT NULL
      AND NOT EXISTS (
            SELECT 1 FROM dbo.tbl_PurInvHeader rv
            WHERE rv.Pih_Loc = h.Pih_Loc
              AND rv.Pih_Reference = h.Pih_Reference
              AND rv.Pih_Type = 'X'
              AND rv.Pih_StkUpdate IS NOT NULL)
      AND h.Pih_Supp IN @SupplierCodes
      AND {dateFilter}";
    }

    /// <summary>Per-line purchase / return columns (same names as the ERP sales version).</summary>
    private const string PurchaseLineColumns = @"
        CAST(h.Pih_PIdate AS date)                                             AS InvDate,
        CASE WHEN h.Pih_Type = 'N' THEN ISNULL(d.Pid_PurQty, 0) ELSE 0 END    AS QtySal,
        CASE WHEN h.Pih_Type = 'R' THEN ISNULL(d.Pid_PurQty, 0) ELSE 0 END    AS QtyRet,
        CASE WHEN h.Pih_Type = 'N' THEN amounts.AmtUSD ELSE 0 END              AS NetSalUSD,
        CASE WHEN h.Pih_Type = 'R' THEN amounts.AmtUSD ELSE 0 END              AS NetRetUSD,
        CASE WHEN h.Pih_Type = 'N' THEN amounts.AmtLBP ELSE 0 END              AS NetSalLBP,
        CASE WHEN h.Pih_Type = 'R' THEN amounts.AmtLBP ELSE 0 END              AS NetRetLBP,
        CASE h.Pih_Curr WHEN 'LL' THEN 'LBP' WHEN '$' THEN 'USD' ELSE h.Pih_Curr END AS SystemCurrency";

    private static string PurchaseTotalsSql(bool byClient, bool scoped, string fromParam, string toParam, bool inclusiveTo = false) => $@"
SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;

SELECT{(byClient ? @"
    SupCode," : "")}
    ISNULL(SUM(NetSalUSD), 0) - ISNULL(SUM(NetRetUSD), 0) AS SalesAmountUSD,
    ISNULL(SUM(NetSalLBP), 0) - ISNULL(SUM(NetRetLBP), 0) AS SalesAmountLBP,
    ISNULL(SUM(QtySal),   0) - ISNULL(SUM(QtyRet),   0)   AS SalesQuantity,
    ISNULL(MAX(SystemCurrency), 'USD')                     AS SystemCurrency
FROM (
    SELECT{(byClient ? $@"
        h.Pih_Supp AS SupCode," : "")}{PurchaseLineColumns}
{PurchaseLinesFrom(scoped, fromParam, toParam, inclusiveTo)}
) agg{(byClient ? @"
GROUP BY SupCode" : "")}";

    private static readonly string UnscopedBatchSalesSqlTemplate = @"
SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
SET NOCOUNT ON;

CREATE TABLE #SalesLines (
    InvDate        date          NOT NULL,
    QtySal         decimal(18,3) NOT NULL,
    QtyRet         decimal(18,3) NOT NULL,
    NetSalUSD      decimal(18,3) NOT NULL,
    NetRetUSD      decimal(18,3) NOT NULL,
    NetSalLBP      decimal(18,3) NOT NULL,
    NetRetLBP      decimal(18,3) NOT NULL,
    SystemCurrency varchar(3)    NOT NULL
);

INSERT INTO #SalesLines (
    InvDate, QtySal, QtyRet, NetSalUSD, NetRetUSD, NetSalLBP, NetRetLBP, SystemCurrency)
SELECT" + PurchaseLineColumns + "\n" + PurchaseLinesFrom(false, "@OverallFromDate", "@OverallToDate") + @";

{0}

DROP TABLE #SalesLines;";

    private static string ItemBreakdownQuery(bool scoped) => $@"
SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;

SELECT * FROM (
    SELECT
        s.Stk_Supplier + '/' + s.Stk_Category + '/' + s.Stk_Serial      AS ItemRef,
        s.Stk_Desc                                                         AS ItemDesc,

        SUM(CASE WHEN h.Pih_Type = 'N' THEN ISNULL(d.Pid_PurQty, 0) ELSE 0 END)
            - SUM(CASE WHEN h.Pih_Type = 'R' THEN ISNULL(d.Pid_PurQty, 0) ELSE 0 END) AS NetQty,

        SUM(CASE WHEN h.Pih_Type = 'N' THEN amounts.AmtUSD ELSE 0 END) AS NetSalUSD,
        SUM(CASE WHEN h.Pih_Type = 'R' THEN amounts.AmtUSD ELSE 0 END) AS NetRetUSD,
        SUM(CASE WHEN h.Pih_Type = 'N' THEN amounts.AmtLBP ELSE 0 END) AS NetSalLBP,
        SUM(CASE WHEN h.Pih_Type = 'R' THEN amounts.AmtLBP ELSE 0 END) AS NetRetLBP
{PurchaseLinesFrom(scoped, "@FromDate", "@ToDate",
        extraJoin: "INNER JOIN dbo.tbl_StockItm s ON s.Stk_Loc = d.Pid_Loc AND s.Stk_StkId = d.Pid_StkId")}
    GROUP BY
        s.Stk_Supplier + '/' + s.Stk_Category + '/' + s.Stk_Serial,
        s.Stk_Desc
) sub
ORDER BY sub.ItemDesc";

    private static readonly string SalesAllCurrenciesSql = PurchaseTotalsSql(false, false, "@FromDate", "@ToDate");
    private static readonly string PreviousYearSalesAllCurrenciesSql = PurchaseTotalsSql(false, false, "@PrevFromDate", "@PrevToDate");
    private static readonly string SalesAllCurrenciesByClientSql = PurchaseTotalsSql(true, false, "@FromDate", "@ToDate");
    private static readonly string PreviousYearSalesAllCurrenciesByClientSql = PurchaseTotalsSql(true, false, "@PrevFromDate", "@PrevToDate");
    private static readonly string ItemBreakdownSql = ItemBreakdownQuery(false);
    private static readonly string TotalSalesAllCurrenciesSql = PurchaseTotalsSql(false, false, "@FromDate", "@ToDate", inclusiveTo: true);

    private static readonly Lazy<string> SalesAllCurrenciesScopedSql =
        new(() => PurchaseTotalsSql(false, true, "@FromDate", "@ToDate"));
    private static readonly Lazy<string> PreviousYearSalesAllCurrenciesScopedSql =
        new(() => PurchaseTotalsSql(false, true, "@PrevFromDate", "@PrevToDate"));
    private static readonly Lazy<string> SalesAllCurrenciesByClientScopedSql =
        new(() => PurchaseTotalsSql(true, true, "@FromDate", "@ToDate"));
    private static readonly Lazy<string> PreviousYearSalesAllCurrenciesByClientScopedSql =
        new(() => PurchaseTotalsSql(true, true, "@PrevFromDate", "@PrevToDate"));
    private static readonly Lazy<string> ItemBreakdownScopedSql =
        new(() => ItemBreakdownQuery(true));

    public CVRComputationDAL(IConfiguration config)
    {
        _config = config;
        _loc = string.IsNullOrWhiteSpace(config["Location"]) ? "01" : config["Location"]!.Trim();
    }

    public async Task<string> GetAppCompAsync()
    {
        using var cvrCon = CvrCon();
        return await GetAppCompFromConnectionAsync(cvrCon);
    }

    private static async Task<string> GetAppCompFromConnectionAsync(SqlConnection cvrCon) =>
        (await cvrCon.QueryFirstOrDefaultAsync<string>(
            "SELECT TOP 1 Ac_Comp FROM Com_Appcomp WHERE Ac_Code = 'CVR' ORDER BY Ac_Comp"))
        ?? "01";

    public async Task<TargetSalesMetadata> LoadTargetSalesMetadataAsync(int targetId, string? comp = null)
    {
        using var cvrCon1 = CvrCon();
        using var cvrCon2 = CvrCon();
        using var cvrCon3 = CvrCon();

        var stockIdsTask = cvrCon1.QueryAsync<decimal>(StockPoolSql, new { TargetId = targetId, Loc = _loc });
        var refsTask = cvrCon2.QueryAsync<CVR_TargetSalesReferenceDto>(
            TargetReferencesDisplaySql, new { TargetId = targetId, Loc = _loc });
        var compTask = comp != null
            ? Task.FromResult(comp)
            : GetAppCompFromConnectionAsync(cvrCon3);

        await Task.WhenAll(stockIdsTask, refsTask, compTask);

        return new TargetSalesMetadata
        {
            StockIds = stockIdsTask.Result.Distinct().ToList(),
            References = refsTask.Result.ToList(),
            Comp = compTask.Result,
        };
    }

    private async Task<CVR_Target?> LoadTargetAsync(int targetId)
    {
        using var cvrCon = CvrCon();
        return await cvrCon.QueryFirstOrDefaultAsync<CVR_Target>(
            "SELECT * FROM CVR_Targets WHERE TAR_TargetID = @TargetId",
            new { TargetId = targetId });
    }

    private static void ValidateTargetDates(
        CVR_Target target, DateTime? fromDateOverride, DateTime? toDateOverride)
    {
        if (!fromDateOverride.HasValue && !target.TAR_FromDate.HasValue)
            throw new InvalidOperationException("Target is missing FromDate or ToDate.");
        if (!toDateOverride.HasValue && !target.TAR_ToDate.HasValue)
            throw new InvalidOperationException("Target is missing FromDate or ToDate.");
    }

    private SqlConnection CvrCon() =>
        new SqlConnection(_config.GetConnectionString("Constr"));

    private SqlConnection StockCon() =>
    new SqlConnection(_config.GetConnectionString("Constr"));

    // ── Simulation breakdown: purchases per supplier × item × month ──────────────────────────

    private static string BreakdownSql(bool scoped, string fromParam, string toParam) => $@"
SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;

SELECT
    h.Pih_Supp                                                       AS SupplierCode,
    ISNULL(MAX(sup.Sup_Name), '')                                    AS SupplierName,
    CAST(d.Pid_StkId AS int)                                         AS StkId,
    MAX(s.Stk_Supplier + '/' + s.Stk_Category + '/' + s.Stk_Serial)  AS ItemRef,
    ISNULL(MAX(s.Stk_Desc), '')                                      AS ItemDesc,
    ISNULL(MAX(s.Stk_Category), '')                                  AS CategoryCode,
    ISNULL(MAX(c.Cat_Desc), '')                                      AS CategoryDesc,
    CONVERT(char(7), h.Pih_PIdate, 126)                              AS MonthKey,
    SUM(CASE WHEN h.Pih_Type = 'N' THEN ISNULL(d.Pid_PurQty, 0) ELSE -ISNULL(d.Pid_PurQty, 0) END) AS Qty,
    SUM(CASE WHEN h.Pih_Type = 'N' THEN amounts.AmtUSD ELSE -amounts.AmtUSD END)                    AS AmountUSD,
    SUM(CASE WHEN h.Pih_Type = 'N' THEN amounts.AmtLBP ELSE -amounts.AmtLBP END)                    AS AmountLBP
{PurchaseLinesFrom(scoped, fromParam, toParam, extraJoin: @"INNER JOIN dbo.tbl_StockItm s ON s.Stk_Loc = d.Pid_Loc AND s.Stk_StkId = d.Pid_StkId
    LEFT JOIN dbo.tbl_Suppliers sup ON sup.Sup_Loc = h.Pih_Loc AND sup.Sup_Code = h.Pih_Supp
    LEFT JOIN dbo.tbl_Categories c ON c.Cat_Loc = s.Stk_Loc AND c.Cat_Code = s.Stk_Category")}
GROUP BY h.Pih_Supp, d.Pid_StkId, CONVERT(char(7), h.Pih_PIdate, 126)";

    private static readonly string BreakdownCurrentSql = BreakdownSql(false, "@FromDate", "@ToDate");
    private static readonly string BreakdownPreviousSql = BreakdownSql(false, "@PrevFromDate", "@PrevToDate");
    private static readonly string BreakdownCurrentScopedSql = BreakdownSql(true, "@FromDate", "@ToDate");
    private static readonly string BreakdownPreviousScopedSql = BreakdownSql(true, "@PrevFromDate", "@PrevToDate");

    /// <summary>
    /// Purchases (Normal − Return, VAT incl.) grouped by supplier, item and month for
    /// [fromDate, toDate) and the same window one year earlier. Scope: the given stock items
    /// and/or categories (the draft's references); none = every item.
    /// </summary>
    public async Task<CVR_BreakdownResponseDto> GetPurchaseBreakdownAsync(
        List<string> supCodes, DateTime fromDate, DateTime toDate,
        List<long>? stockIds, List<int>? categoryIds)
    {
        var result = new CVR_BreakdownResponseDto { FromDate = fromDate.Date, ToDate = toDate.Date };
        if (supCodes == null || supCodes.Count == 0) return result;

        var stock = (stockIds ?? new()).Where(x => x > 0).Distinct().ToList();
        var categoryCodes = SuperStoreKeys.ToCodes(categoryIds);
        var scoped = stock.Count > 0 || categoryCodes.Count > 0;

        using var con = StockCon();
        await con.OpenAsync();
        if (scoped)
        {
            // one round trip whatever the size of the scope (STRING_SPLIT: SQL 2016+)
            // created without parameters so it lives for the session (a parameterised batch runs
            // in sp_executesql, whose temp tables vanish when it returns)
            await con.ExecuteAsync(@"
IF OBJECT_ID('tempdb..#StockFilter') IS NOT NULL DROP TABLE #StockFilter;
CREATE TABLE #StockFilter (StkId bigint NOT NULL PRIMARY KEY);");
            await con.ExecuteAsync(@"
INSERT INTO #StockFilter (StkId)
SELECT DISTINCT x.StkId FROM (
    SELECT TRY_CAST(value AS bigint) AS StkId FROM STRING_SPLIT(@StockIds, ',')
    UNION
    SELECT CAST(Stk_StkId AS bigint) FROM dbo.tbl_StockItm
    WHERE Stk_Loc = @Loc AND Stk_Category IN @CategoryCodes
) x WHERE x.StkId IS NOT NULL;",
                new
                {
                    StockIds = string.Join(",", stock),
                    Loc = _loc,
                    CategoryCodes = categoryCodes.Count > 0 ? categoryCodes : new List<string> { "\u0001" },
                });
        }

        var from = fromDate.Date;
        var to = toDate.Date;
        var param = new
        {
            SupplierCodes = supCodes,
            Loc = _loc,
            FromDate = from,
            ToDate = to,
            PrevFromDate = from.AddYears(-1),
            PrevToDate = to.AddYears(-1),
        };

        result.Current = (await con.QueryAsync<CVR_BreakdownRowDto>(
            scoped ? BreakdownCurrentScopedSql : BreakdownCurrentSql, param, commandTimeout: 120)).ToList();
        result.Previous = (await con.QueryAsync<CVR_BreakdownRowDto>(
            scoped ? BreakdownPreviousScopedSql : BreakdownPreviousSql, param, commandTimeout: 120)).ToList();
        result.Scoped = scoped;
        return result;
    }

    private static async Task PopulateStockFilterTempAsync(SqlConnection stockCon, IReadOnlyList<long> stockIds)
    {
        await stockCon.ExecuteAsync(@"
IF OBJECT_ID('tempdb..#StockFilter') IS NOT NULL DROP TABLE #StockFilter;
CREATE TABLE #StockFilter (StkId bigint NOT NULL PRIMARY KEY);");

        if (stockIds.Count == 0)
            return;

        await stockCon.ExecuteAsync(
            "INSERT INTO #StockFilter (StkId) VALUES (@StkId)",
            stockIds.Select(id => new { StkId = id }));
    }

    private static async Task PrepareStockConnectionAsync(
        SqlConnection stockCon, bool filterByStock, IReadOnlyList<long> stockIds)
    {
        if (stockCon.State != System.Data.ConnectionState.Open)
            await stockCon.OpenAsync();
        if (filterByStock)
            await PopulateStockFilterTempAsync(stockCon, stockIds);
    }

    public async Task<CVR_TargetSalesDto?> GetTargetSalesAsync(
        List<string> supCodes, int targetId, DateTime? fromDateOverride = null, DateTime? toDateOverride = null)
    {
        if (supCodes == null || supCodes.Count == 0) return null;

        var target = await LoadTargetAsync(targetId);
        if (target == null) return null;

        ValidateTargetDates(target, fromDateOverride, toDateOverride);
        var metadata = await LoadTargetSalesMetadataAsync(targetId);
        return await GetTargetSalesAsync(supCodes, target, metadata, fromDateOverride, toDateOverride);
    }

    public async Task<CVR_TargetSalesDto?> GetTargetSalesAsync(
        List<string> supCodes,
        CVR_Target target,
        TargetSalesMetadata metadata,
        DateTime? fromDateOverride = null,
        DateTime? toDateOverride = null)
    {
        if (supCodes == null || supCodes.Count == 0) return null;

        ValidateTargetDates(target, fromDateOverride, toDateOverride);

        var targetId = (int)target.TAR_TargetID;
        var filterByStock = metadata.FilterByStock;
        var stockFilterIds = metadata.StockIds.Select(x => (long)x).Distinct().ToList();

        var fromDate = (fromDateOverride ?? target.TAR_FromDate)!.Value.Date;
        var toDate = (toDateOverride ?? target.TAR_ToDate)!.Value.Date;
        var prevFromDate = fromDate.AddYears(-1);
        var prevToDate = toDate.AddYears(-1);

        var baseParams = new
        {
            SupCodes = supCodes,
            SupplierCodes = supCodes,
            Loc = _loc,
            FromDate = fromDate,
            ToDate = toDate,
            Comp = metadata.Comp,
        };

        var prevParams = new
        {
            SupCodes = supCodes,
            SupplierCodes = supCodes,
            Loc = _loc,
            PrevFromDate = prevFromDate,
            PrevToDate = prevToDate,
            Comp = metadata.Comp,
        };

        using var stockCon1 = StockCon();
        using var stockCon2 = StockCon();

        await PrepareStockConnectionAsync(stockCon1, filterByStock, stockFilterIds);
        await PrepareStockConnectionAsync(stockCon2, filterByStock, stockFilterIds);

        var salesSql = filterByStock ? SalesAllCurrenciesScopedSql.Value : SalesAllCurrenciesSql;
        var prevSalesSql = filterByStock
            ? PreviousYearSalesAllCurrenciesScopedSql.Value
            : PreviousYearSalesAllCurrenciesSql;

        var rowTask = stockCon1.QueryFirstAsync<AllCurrenciesSalesRow>(salesSql, baseParams);
        var prevRowTask = stockCon2.QueryFirstAsync<AllCurrenciesSalesRow>(prevSalesSql, prevParams);

        await Task.WhenAll(rowTask, prevRowTask);

        var row = rowTask.Result;
        var prevRow = prevRowTask.Result;

        decimal growthPercentageUSD = 0;
        if (prevRow.SalesAmountUSD != 0)
            growthPercentageUSD = ((row.SalesAmountUSD - prevRow.SalesAmountUSD) / prevRow.SalesAmountUSD) * 100;

        return new CVR_TargetSalesDto
        {
            SupCode = supCodes[0],
            TargetId = targetId,
            FromDate = fromDate,
            ToDate = toDate,
            SalesAmounts = new Dictionary<string, decimal> { ["USD"] = row.SalesAmountUSD, ["LBP"] = row.SalesAmountLBP },
            SalesAmount = row.SalesAmountUSD,
            SalesAmountBase = row.SalesAmountUSD,
            SalesQuantity = row.SalesQuantity,
            SystemCurrency = row.SystemCurrency,
            SalesAmountCurrency = null,
            ReferenceScope = metadata.ReferenceScope,
            References = metadata.References,
            ResolvedStockItemCount = metadata.StockIds.Count,
            FetchedAt = DateTime.UtcNow,
            PreviousYearSalesAmounts = new Dictionary<string, decimal> { ["USD"] = prevRow.SalesAmountUSD, ["LBP"] = prevRow.SalesAmountLBP },
            PreviousYearSalesQuantity = prevRow.SalesQuantity,
            GrowthPercentageUSD = growthPercentageUSD,
            PreviousYearFromDate = prevFromDate,
            PreviousYearToDate = prevToDate,
        };
    }

    public async Task<Dictionary<string, CVR_TargetSalesDto>> GetTargetSalesByClientBatchAsync(
        List<string> supCodes, int targetId, DateTime? fromDateOverride = null, DateTime? toDateOverride = null)
    {
        if (supCodes == null || supCodes.Count == 0)
            return new Dictionary<string, CVR_TargetSalesDto>();

        var target = await LoadTargetAsync(targetId);
        if (target == null) return new Dictionary<string, CVR_TargetSalesDto>();

        ValidateTargetDates(target, fromDateOverride, toDateOverride);
        var metadata = await LoadTargetSalesMetadataAsync(targetId);
        return await GetTargetSalesByClientBatchAsync(supCodes, target, metadata, fromDateOverride, toDateOverride);
    }

    public async Task<Dictionary<string, CVR_TargetSalesDto>> GetTargetSalesByClientBatchAsync(
        List<string> supCodes,
        CVR_Target target,
        TargetSalesMetadata metadata,
        DateTime? fromDateOverride = null,
        DateTime? toDateOverride = null)
    {
        if (supCodes == null || supCodes.Count == 0)
            return new Dictionary<string, CVR_TargetSalesDto>();

        ValidateTargetDates(target, fromDateOverride, toDateOverride);

        var targetId = (int)target.TAR_TargetID;
        var filterByStock = metadata.FilterByStock;
        var stockFilterIds = metadata.StockIds.Select(x => (long)x).Distinct().ToList();

        var fromDate = (fromDateOverride ?? target.TAR_FromDate)!.Value.Date;
        var toDate = (toDateOverride ?? target.TAR_ToDate)!.Value.Date;
        var prevFromDate = fromDate.AddYears(-1);
        var prevToDate = toDate.AddYears(-1);

        var baseParams = new
        {
            SupCodes = supCodes,
            SupplierCodes = supCodes,
            Loc = _loc,
            FromDate = fromDate,
            ToDate = toDate,
            Comp = metadata.Comp,
        };

        var prevParams = new
        {
            SupCodes = supCodes,
            SupplierCodes = supCodes,
            Loc = _loc,
            PrevFromDate = prevFromDate,
            PrevToDate = prevToDate,
            Comp = metadata.Comp,
        };

        using var stockCon1 = StockCon();
        using var stockCon2 = StockCon();

        await PrepareStockConnectionAsync(stockCon1, filterByStock, stockFilterIds);
        await PrepareStockConnectionAsync(stockCon2, filterByStock, stockFilterIds);

        var salesSql = filterByStock ? SalesAllCurrenciesByClientScopedSql.Value : SalesAllCurrenciesByClientSql;
        var prevSalesSql = filterByStock
            ? PreviousYearSalesAllCurrenciesByClientScopedSql.Value
            : PreviousYearSalesAllCurrenciesByClientSql;

        var currentRowsTask = stockCon1.QueryAsync<AllCurrenciesSalesByClientRow>(salesSql, baseParams);
        var prevRowsTask = stockCon2.QueryAsync<AllCurrenciesSalesByClientRow>(prevSalesSql, prevParams);

        await Task.WhenAll(currentRowsTask, prevRowsTask);

        var currentByClient = currentRowsTask.Result.ToDictionary(r => r.SupCode);
        var prevByClient = prevRowsTask.Result.ToDictionary(r => r.SupCode);

        var activeClientIds = currentByClient.Keys
            .Union(prevByClient.Keys)
            .Where(id => supCodes.Contains(id))
            .ToList();

        var result = new Dictionary<string, CVR_TargetSalesDto>();
        foreach (var supCode in activeClientIds)
        {
            currentByClient.TryGetValue(supCode, out var row);
            prevByClient.TryGetValue(supCode, out var prevRow);
            row ??= new AllCurrenciesSalesByClientRow { SupCode = supCode };
            prevRow ??= new AllCurrenciesSalesByClientRow { SupCode = supCode };

            decimal growthPercentageUSD = 0;
            if (prevRow.SalesAmountUSD != 0)
                growthPercentageUSD = ((row.SalesAmountUSD - prevRow.SalesAmountUSD) / prevRow.SalesAmountUSD) * 100;

            result[supCode] = new CVR_TargetSalesDto
            {
                SupCode = supCode,
                TargetId = targetId,
                FromDate = fromDate,
                ToDate = toDate,
                SalesAmounts = new Dictionary<string, decimal>
                {
                    ["USD"] = row.SalesAmountUSD,
                    ["LBP"] = row.SalesAmountLBP,
                },
                SalesAmount = row.SalesAmountUSD,
                SalesAmountBase = row.SalesAmountUSD,
                SalesQuantity = row.SalesQuantity,
                SystemCurrency = row.SystemCurrency ?? "USD",
                SalesAmountCurrency = null,
                ReferenceScope = metadata.ReferenceScope,
                References = metadata.References,
                ResolvedStockItemCount = metadata.StockIds.Count,
                FetchedAt = DateTime.UtcNow,
                PreviousYearSalesAmounts = new Dictionary<string, decimal>
                {
                    ["USD"] = prevRow.SalesAmountUSD,
                    ["LBP"] = prevRow.SalesAmountLBP,
                },
                PreviousYearSalesQuantity = prevRow.SalesQuantity,
                GrowthPercentageUSD = growthPercentageUSD,
                PreviousYearFromDate = prevFromDate,
                PreviousYearToDate = prevToDate,
            };
        }

        return result;
    }

    public async Task<Dictionary<int, CVR_TargetSalesDto>> GetTargetSalesBatchAsync(
        List<string> supCodes, List<int> targetIds)
    {
        if (supCodes == null || supCodes.Count == 0 || targetIds == null || targetIds.Count == 0)
            return new Dictionary<int, CVR_TargetSalesDto>();

        var distinctTargetIds = targetIds.Distinct().ToList();

        using var cvrCon1 = CvrCon();
        var targets = (await cvrCon1.QueryAsync<CVR_Target>(@"
            SELECT
                TAR_TargetID, TAR_PlanID, TAR_TargetName,
                TAR_FromDate, TAR_ToDate, TAR_RebateValue,
                TAR_RebateValueType, TAR_Currency, TAR_SettlementTypeID,
                TAR_ComputationTypeID, TAR_TargetType,
                ISNULL(TAR_Override, 0) AS TAR_Override,
                TAR_CDStamp, TAR_CUStamp, TAR_MDStamp, TAR_MUStamp
            FROM CVR_Targets WHERE TAR_TargetID IN @TargetIds",
            new { TargetIds = distinctTargetIds })).ToList();

        if (targets.Count == 0)
            return new Dictionary<int, CVR_TargetSalesDto>();

        foreach (var t in targets)
            if (!t.TAR_FromDate.HasValue || !t.TAR_ToDate.HasValue)
                throw new InvalidOperationException("Target is missing FromDate or ToDate.");

        using var cvrCon2 = CvrCon();
        using var cvrCon3 = CvrCon();
        using var cvrCon4 = CvrCon();

        var compTask = GetAppCompFromConnectionAsync(cvrCon2);
        var stockPoolTask = cvrCon3.QueryAsync<StockPoolBatchRow>(
                                StockPoolBatchSql, new { TargetIds = distinctTargetIds, Loc = _loc });
        var refsTask = cvrCon4.QueryAsync<TargetReferenceBatchRow>(
                                TargetReferencesDisplayBatchSql, new { TargetIds = distinctTargetIds, Loc = _loc });

        await Task.WhenAll(compTask, stockPoolTask, refsTask);

        var comp = compTask.Result;
        var stockPoolRows = stockPoolTask.Result.ToList();
        var referenceRows = refsTask.Result.ToList();

        var stockIdsByTarget = stockPoolRows
            .GroupBy(r => (int)r.TargetId)
            .ToDictionary(g => g.Key, g => g.Select(x => x.StkRecId).Distinct().ToList());

        var referencesByTarget = referenceRows
            .GroupBy(r => (int)r.TargetId)
            .ToDictionary(g => g.Key, g => g.Select(x => new CVR_TargetSalesReferenceDto
            {
                ScopeType = x.ScopeType ?? string.Empty,
                Code = x.Code ?? string.Empty,
                Description = x.Description ?? string.Empty,
            }).ToList());

        var unscopedTargets = new List<CVR_Target>();
        var scopedTargetIds = new List<int>();

        foreach (var target in targets)
        {
            var tid = (int)target.TAR_TargetID;
            if (stockIdsByTarget.TryGetValue(tid, out var ids) && ids.Count > 0)
                scopedTargetIds.Add(tid);
            else
                unscopedTargets.Add(target);
        }

        var unscopedTask = unscopedTargets.Count > 0
            ? GetUnscopedTargetSalesBatchAsync(
                supCodes, unscopedTargets, referencesByTarget, stockIdsByTarget, comp)
            : Task.FromResult(new List<CVR_TargetSalesDto>());

        var scopedTask = scopedTargetIds.Count > 0
            ? GetScopedTargetSalesBatchAsync(supCodes, scopedTargetIds)
            : Task.FromResult(Array.Empty<CVR_TargetSalesDto>());

        await Task.WhenAll(unscopedTask, scopedTask);

        var results = new Dictionary<int, CVR_TargetSalesDto>();
        foreach (var dto in unscopedTask.Result) results[dto.TargetId] = dto;
        foreach (var dto in scopedTask.Result) results[dto.TargetId] = dto;

        return results;
    }

    private async Task<CVR_TargetSalesDto[]> GetScopedTargetSalesBatchAsync(
        List<string> supCodes, List<int> scopedTargetIds)
    {
        using var semaphore = new SemaphoreSlim(4);
        var tasks = scopedTargetIds.Select(async targetId =>
        {
            await semaphore.WaitAsync();
            try { return await GetTargetSalesAsync(supCodes, targetId); }
            finally { semaphore.Release(); }
        });

        var results = await Task.WhenAll(tasks);
        return results.Where(d => d != null).Select(d => d!).ToArray();
    }

    private async Task<List<CVR_TargetSalesDto>> GetUnscopedTargetSalesBatchAsync(
        List<string> supCodes,
        List<CVR_Target> targets,
        Dictionary<int, List<CVR_TargetSalesReferenceDto>> referencesByTarget,
        Dictionary<int, List<decimal>> stockIdsByTarget,
        string comp)
    {
        var dateRanges = targets.Select(t =>
        {
            var fromDate = t.TAR_FromDate!.Value.Date;
            var toDate = t.TAR_ToDate!.Value.Date;
            return new TargetDateRange
            {
                TargetId = (int)t.TAR_TargetID,
                FromDate = fromDate,
                ToDate = toDate,
                PrevFromDate = fromDate.AddYears(-1),
                PrevToDate = toDate.AddYears(-1),
            };
        }).ToList();

        var overallFromDate = dateRanges.Min(r => r.PrevFromDate);
        var overallToDate = dateRanges.Max(r => r.ToDate);
        var aggregateSql = BuildUnscopedBatchAggregateSelect(dateRanges);
        var sql = string.Format(CultureInfo.InvariantCulture, UnscopedBatchSalesSqlTemplate, aggregateSql);

        using var stockCon = StockCon();
        var rowDict = await QueryUnscopedBatchAggregateRowAsync(stockCon, sql, new
        {
            SupCodes = supCodes,
            SupplierCodes = supCodes,
            Loc = _loc,
            OverallFromDate = overallFromDate,
            OverallToDate = overallToDate,
            Comp = comp,
        });

        var rows = dateRanges.Select(range =>
        {
            var id = range.TargetId;
            return new UnscopedBatchSalesRow
            {
                TargetId = id,
                SalesAmountUSD = ReadAggregateDecimal(rowDict, $"T{id}_SalesAmountUSD"),
                SalesAmountLBP = ReadAggregateDecimal(rowDict, $"T{id}_SalesAmountLBP"),
                SalesQuantity = ReadAggregateDecimal(rowDict, $"T{id}_SalesQuantity"),
                PrevSalesAmountUSD = ReadAggregateDecimal(rowDict, $"T{id}_PrevSalesAmountUSD"),
                PrevSalesAmountLBP = ReadAggregateDecimal(rowDict, $"T{id}_PrevSalesAmountLBP"),
                PrevSalesQuantity = ReadAggregateDecimal(rowDict, $"T{id}_PrevSalesQuantity"),
                SystemCurrency = TryGetRowValue(rowDict, "SystemCurrency", out var curVal)
                    ? curVal?.ToString() ?? "USD" : "USD",
            };
        }).ToList();

        var rowByTargetId = rows.ToDictionary(r => r.TargetId);

        return targets.Select(target =>
        {
            var targetId = (int)target.TAR_TargetID;
            rowByTargetId.TryGetValue(targetId, out var row);
            row ??= new UnscopedBatchSalesRow { TargetId = targetId };

            var prevFromDate = target.TAR_FromDate!.Value.Date.AddYears(-1);
            var prevToDate = target.TAR_ToDate!.Value.Date.AddYears(-1);

            decimal growthPercentageUSD = 0;
            if (row.PrevSalesAmountUSD != 0)
                growthPercentageUSD = ((row.SalesAmountUSD - row.PrevSalesAmountUSD) / row.PrevSalesAmountUSD) * 100;

            referencesByTarget.TryGetValue(targetId, out var references);
            stockIdsByTarget.TryGetValue(targetId, out var stockIds);

            return new CVR_TargetSalesDto
            {
                SupCode = supCodes[0],
                TargetId = targetId,
                FromDate = target.TAR_FromDate,
                ToDate = target.TAR_ToDate,
                SalesAmounts = new Dictionary<string, decimal> { ["USD"] = row.SalesAmountUSD, ["LBP"] = row.SalesAmountLBP },
                SalesAmount = row.SalesAmountUSD,
                SalesAmountBase = row.SalesAmountUSD,
                SalesQuantity = row.SalesQuantity,
                SystemCurrency = row.SystemCurrency,
                SalesAmountCurrency = null,
                ReferenceScope = "all",
                References = references ?? new List<CVR_TargetSalesReferenceDto>(),
                ResolvedStockItemCount = stockIds?.Count ?? 0,
                FetchedAt = DateTime.UtcNow,
                PreviousYearSalesAmounts = new Dictionary<string, decimal> { ["USD"] = row.PrevSalesAmountUSD, ["LBP"] = row.PrevSalesAmountLBP },
                PreviousYearSalesQuantity = row.PrevSalesQuantity,
                GrowthPercentageUSD = growthPercentageUSD,
                PreviousYearFromDate = prevFromDate,
                PreviousYearToDate = prevToDate,
            };
        }).ToList();
    }

    private static string BuildUnscopedBatchAggregateSelect(IReadOnlyList<TargetDateRange> ranges)
    {
        var parts = new List<string>();
        foreach (var r in ranges)
        {
            var id = r.TargetId;
            var from = r.FromDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            var to = r.ToDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            var pFrom = r.PrevFromDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            var pTo = r.PrevToDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

            parts.Add($@"ISNULL(SUM(CASE WHEN InvDate >= '{from}' AND InvDate < '{to}'
        THEN NetSalUSD - NetRetUSD ELSE 0 END), 0) AS T{id}_SalesAmountUSD");
            parts.Add($@"ISNULL(SUM(CASE WHEN InvDate >= '{from}' AND InvDate < '{to}'
        THEN NetSalLBP - NetRetLBP ELSE 0 END), 0) AS T{id}_SalesAmountLBP");
            parts.Add($@"ISNULL(SUM(CASE WHEN InvDate >= '{from}' AND InvDate < '{to}'
        THEN QtySal - QtyRet ELSE 0 END), 0) AS T{id}_SalesQuantity");
            parts.Add($@"ISNULL(SUM(CASE WHEN InvDate >= '{pFrom}' AND InvDate < '{pTo}'
        THEN NetSalUSD - NetRetUSD ELSE 0 END), 0) AS T{id}_PrevSalesAmountUSD");
            parts.Add($@"ISNULL(SUM(CASE WHEN InvDate >= '{pFrom}' AND InvDate < '{pTo}'
        THEN NetSalLBP - NetRetLBP ELSE 0 END), 0) AS T{id}_PrevSalesAmountLBP");
            parts.Add($@"ISNULL(SUM(CASE WHEN InvDate >= '{pFrom}' AND InvDate < '{pTo}'
        THEN QtySal - QtyRet ELSE 0 END), 0) AS T{id}_PrevSalesQuantity");
        }

        parts.Add("ISNULL(MAX(SystemCurrency), 'USD') AS SystemCurrency");
        return "SELECT\n    " + string.Join(",\n    ", parts) + "\nFROM #SalesLines;";
    }

    private static async Task<IDictionary<string, object>> QueryUnscopedBatchAggregateRowAsync(
        SqlConnection stockCon, string sql, object param)
    {
        using var grid = await stockCon.QueryMultipleAsync(sql, param);

        while (!grid.IsConsumed)
        {
            var batchRows = (await grid.ReadAsync<object>()).ToList();
            if (batchRows.Count == 0) continue;
            return ToRowDictionary(batchRows[0]);
        }

        return new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
    }

    private static IDictionary<string, object> ToRowDictionary(object? row)
    {
        var result = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        if (row == null) return result;

        if (row is IDictionary<string, object> dict)
        {
            foreach (var kvp in dict) result[kvp.Key] = kvp.Value ?? 0;
            return result;
        }

        if (row is System.Collections.IDictionary legacy)
        {
            foreach (System.Collections.DictionaryEntry entry in legacy)
                if (entry.Key is string key) result[key] = entry.Value ?? 0;
            return result;
        }

        return result;
    }

    private static decimal ReadAggregateDecimal(IDictionary<string, object> row, string key)
    {
        if (!TryGetRowValue(row, key, out var value)) return 0m;

        return value switch
        {
            decimal dec => dec,
            double dbl => Convert.ToDecimal(dbl, CultureInfo.InvariantCulture),
            float flt => Convert.ToDecimal(flt, CultureInfo.InvariantCulture),
            int i => i,
            long l => l,
            _ => Convert.ToDecimal(value, CultureInfo.InvariantCulture),
        };
    }

    private static bool TryGetRowValue(IDictionary<string, object> row, string key, out object? value)
    {
        if (row.TryGetValue(key, out value) && value is not null and not DBNull)
            return true;

        var match = row.Keys.FirstOrDefault(k =>
            string.Equals(k, key, StringComparison.OrdinalIgnoreCase));
        if (match != null && row.TryGetValue(match, out value) && value is not null and not DBNull)
            return true;

        value = null;
        return false;
    }

    public async Task<CVR_TargetItemsResponseDto?> GetTargetItemsAsync(List<string> supCodes, int targetId)
    {
        if (supCodes == null || supCodes.Count == 0) return null;

        using var cvrCon1 = CvrCon();
        var target = await cvrCon1.QueryFirstOrDefaultAsync<CVR_Target>(
            "SELECT * FROM CVR_Targets WHERE TAR_TargetID = @TargetId",
            new { TargetId = targetId });

        if (target == null) return null;
        if (!target.TAR_FromDate.HasValue || !target.TAR_ToDate.HasValue)
            throw new InvalidOperationException("Target is missing FromDate or ToDate.");

        using var cvrCon2 = CvrCon();
        using var cvrCon3 = CvrCon();

        var compTask = GetAppCompFromConnectionAsync(cvrCon2);
        var stockIdsTask = cvrCon3.QueryAsync<decimal>(StockPoolSql, new { TargetId = targetId, Loc = _loc });

        await Task.WhenAll(compTask, stockIdsTask);

        var comp = compTask.Result;
        var stockIds = stockIdsTask.Result.Distinct().ToList();

        var filterByStock = stockIds.Count > 0;
        var referenceScope = filterByStock ? "scoped" : "all";
        var stockFilterIds = stockIds.Select(x => (long)x).Distinct().ToList();

        var baseParams = new
        {
            SupCodes = supCodes,
            SupplierCodes = supCodes,
            Loc = _loc,
            FromDate = target.TAR_FromDate.Value.Date,
            ToDate = target.TAR_ToDate.Value.Date,
            Comp = comp,
        };

        using var stockCon = StockCon();
        await PrepareStockConnectionAsync(stockCon, filterByStock, stockFilterIds);
        var itemsSql = filterByStock ? ItemBreakdownScopedSql.Value : ItemBreakdownSql;
        var rows = (await stockCon.QueryAsync<TargetItemRow>(itemsSql, baseParams)).ToList();

        return new CVR_TargetItemsResponseDto
        {
            SupCode = supCodes[0],
            TargetId = targetId,
            ReferenceScope = referenceScope,
            Currencies = new List<string> { "LBP", "USD" },
            Items = rows
                
                .Select(r => new CVR_TargetItemDto
                {
                    ItemRef = r.ItemRef ?? string.Empty,
                    ItemDesc = r.ItemDesc ?? string.Empty,
                    NetQty = r.NetQty,
                    NetSal = r.NetSalUSD,
                    NetRet = r.NetRetUSD,
                    NetSalUSD = r.NetSalUSD,
                    NetRetUSD = r.NetRetUSD,
                    NetSalLBP = r.NetSalLBP,
                    NetRetLBP = r.NetRetLBP,
                    Currency = "USD",
                }).ToList(),
        };
    }

    // -------------------------------------------------------------------------
    // Plan-editor simulation: sales for draft target date ranges
    // -------------------------------------------------------------------------
    public async Task<Dictionary<string, CVR_TargetSalesDto>> GetTargetSalesPreviewBatchAsync(
        List<string> supCodes, List<CVR_SalesBatchPreviewTarget> targets)
    {
        var result = new Dictionary<string, CVR_TargetSalesDto>(StringComparer.Ordinal);
        if (supCodes == null || supCodes.Count == 0 || targets == null || targets.Count == 0)
            return result;

        using var semaphore = new SemaphoreSlim(4);
        var tasks = targets.Select(async entry =>
        {
            await semaphore.WaitAsync();
            try
            {
                var key = !string.IsNullOrWhiteSpace(entry.LocalKey)
                    ? entry.LocalKey.Trim()
                    : entry.TargetId?.ToString() ?? string.Empty;
                if (string.IsNullOrEmpty(key)) return (Key: key, Dto: (CVR_TargetSalesDto?)null);

                CVR_TargetSalesDto? dto;
                if (entry.TargetId.HasValue && entry.TargetId.Value > 0)
                {
                    dto = await GetTargetSalesAsync(
                        supCodes,
                        entry.TargetId.Value,
                        entry.FromDate,
                        entry.ToDate);
                }
                else
                {
                    dto = await GetUnscopedPreviewSalesAsync(supCodes, entry.FromDate, entry.ToDate);
                }

                return (Key: key, Dto: dto);
            }
            finally
            {
                semaphore.Release();
            }
        });

        foreach (var item in await Task.WhenAll(tasks))
        {
            if (!string.IsNullOrEmpty(item.Key) && item.Dto != null)
                result[item.Key] = item.Dto;
        }

        return result;
    }

    private async Task<CVR_TargetSalesDto> GetUnscopedPreviewSalesAsync(
        List<string> supCodes, DateTime fromDate, DateTime toDate)
    {
        using var cvrCon = CvrCon();
        var comp = await GetAppCompFromConnectionAsync(cvrCon);

        var from = fromDate.Date;
        var to = toDate.Date;
        var prevFromDate = from.AddYears(-1);
        var prevToDate = to.AddYears(-1);

        var baseParams = new
        {
            SupCodes = supCodes,
            SupplierCodes = supCodes,
            Loc = _loc,
            FromDate = from,
            ToDate = to,
            Comp = comp,
        };

        var prevParams = new
        {
            SupCodes = supCodes,
            SupplierCodes = supCodes,
            Loc = _loc,
            PrevFromDate = prevFromDate,
            PrevToDate = prevToDate,
            Comp = comp,
        };

        using var stockCon1 = StockCon();
        using var stockCon2 = StockCon();

        var rowTask = stockCon1.QueryFirstAsync<AllCurrenciesSalesRow>(SalesAllCurrenciesSql, baseParams);
        var prevRowTask = stockCon2.QueryFirstAsync<AllCurrenciesSalesRow>(PreviousYearSalesAllCurrenciesSql, prevParams);

        await Task.WhenAll(rowTask, prevRowTask);

        var row = rowTask.Result;
        var prevRow = prevRowTask.Result;

        decimal growthPercentageUSD = 0;
        if (prevRow.SalesAmountUSD != 0)
            growthPercentageUSD = ((row.SalesAmountUSD - prevRow.SalesAmountUSD) / prevRow.SalesAmountUSD) * 100;

        return new CVR_TargetSalesDto
        {
            SupCode = supCodes[0],
            TargetId = 0,
            FromDate = from,
            ToDate = to,
            SalesAmounts = new Dictionary<string, decimal> { ["USD"] = row.SalesAmountUSD, ["LBP"] = row.SalesAmountLBP },
            SalesAmount = row.SalesAmountUSD,
            SalesAmountBase = row.SalesAmountUSD,
            SalesQuantity = row.SalesQuantity,
            SystemCurrency = row.SystemCurrency,
            SalesAmountCurrency = null,
            ReferenceScope = "all",
            References = new List<CVR_TargetSalesReferenceDto>(),
            ResolvedStockItemCount = 0,
            FetchedAt = DateTime.UtcNow,
            PreviousYearSalesAmounts = new Dictionary<string, decimal> { ["USD"] = prevRow.SalesAmountUSD, ["LBP"] = prevRow.SalesAmountLBP },
            PreviousYearSalesQuantity = prevRow.SalesQuantity,
            GrowthPercentageUSD = growthPercentageUSD,
            PreviousYearFromDate = prevFromDate,
            PreviousYearToDate = prevToDate,
        };
    }

    // -------------------------------------------------------------------------
    // SESSION 8 FIX: accepts List<string> supCodes instead of single string supCode
    // -------------------------------------------------------------------------
    public async Task<CVR_TotalSalesDto> GetTotalClientSalesAsync(
        List<string> supCodes, DateTime fromDate, DateTime toDate)
    {
        using var cvrCon = CvrCon();
        var comp = await GetAppCompFromConnectionAsync(cvrCon);


        var baseParams = new
        {
            SupCodes = supCodes,
            SupplierCodes = supCodes,
            Loc = _loc,
            FromDate = fromDate.Date,
            ToDate = toDate.Date,
            Comp = comp,
        };

        using var stockCon = StockCon();
        var row = await stockCon.QueryFirstAsync<AllCurrenciesSalesRow>(
            TotalSalesAllCurrenciesSql, baseParams);

        return new CVR_TotalSalesDto
        {
            SupCode = supCodes[0],
            FromDate = fromDate,
            ToDate = toDate,
            SalesAmountUSD = row.SalesAmountUSD,
            SalesAmountLBP = row.SalesAmountLBP,
            SalesQuantity = row.SalesQuantity,
            SystemCurrency = row.SystemCurrency,
        };
    }

    private sealed class AllCurrenciesSalesRow
    {
        public decimal SalesAmountUSD { get; set; }
        public decimal SalesAmountLBP { get; set; }
        public decimal SalesQuantity { get; set; }
        public string SystemCurrency { get; set; } = "USD";
    }

    private sealed class AllCurrenciesSalesByClientRow
    {
        public string SupCode { get; set; } = string.Empty;
        public decimal SalesAmountUSD { get; set; }
        public decimal SalesAmountLBP { get; set; }
        public decimal SalesQuantity { get; set; }
        public string? SystemCurrency { get; set; }
    }

    private sealed class TargetItemRow
    {
        public string? ItemRef { get; set; }
        public string? ItemDesc { get; set; }
        public decimal NetQty { get; set; }
        public decimal NetSalUSD { get; set; }
        public decimal NetRetUSD { get; set; }
        public decimal NetSalLBP { get; set; }
        public decimal NetRetLBP { get; set; }
        public string? Currency { get; set; }
    }

    private sealed class StockPoolBatchRow
    {
        public decimal TargetId { get; set; }
        public decimal StkRecId { get; set; }
    }

    private sealed class TargetReferenceBatchRow
    {
        public decimal TargetId { get; set; }
        public string? ScopeType { get; set; }
        public string? Code { get; set; }
        public string? Description { get; set; }
    }

    private sealed class TargetDateRange
    {
        public int TargetId { get; set; }
        public DateTime FromDate { get; set; }
        public DateTime ToDate { get; set; }
        public DateTime PrevFromDate { get; set; }
        public DateTime PrevToDate { get; set; }
    }

    private sealed class UnscopedBatchSalesRow
    {
        public int TargetId { get; set; }
        public decimal SalesAmountUSD { get; set; }
        public decimal SalesAmountLBP { get; set; }
        public decimal SalesQuantity { get; set; }
        public decimal PrevSalesAmountUSD { get; set; }
        public decimal PrevSalesAmountLBP { get; set; }
        public decimal PrevSalesQuantity { get; set; }
        public string SystemCurrency { get; set; } = "USD";
    }
}