using Dapper;
using DataService.Models.DTOs;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

/// <summary>
/// Stock item / category lookups for target references (SuperStore tbl_StockItm, tbl_Categories).
/// DTO property names are kept from the ERP version (STK_RECID, IT_RecID …) so the UI is unchanged;
/// IT_RecID carries the category id produced by <see cref="SuperStoreKeys"/> from Cat_Code.
/// </summary>
public class CVRLookupsDAL
{
    private const int MaxTake = 200;
    private const int DefaultTake = 50;

    private readonly IConfiguration _config;
    private readonly string _loc;

    public CVRLookupsDAL(IConfiguration config)
    {
        _config = config;
        _loc = string.IsNullOrWhiteSpace(config["Location"]) ? "01" : config["Location"]!.Trim();
    }

    private SqlConnection Con() =>
        new SqlConnection(_config.GetConnectionString("Constr"));

    private const string StockFromWhere = @"
FROM dbo.tbl_StockItm s
WHERE s.Stk_Loc = @Loc
  AND s.Stk_Status = 'A'
  AND (
        @Like IS NULL
        OR (s.Stk_Supplier + '/' + s.Stk_Category + '/' + s.Stk_Serial) LIKE @Like
        OR s.Stk_Desc LIKE @Like
        OR s.Stk_Barcode1 LIKE @Like
        OR s.Stk_Barcode2 LIKE @Like
      )";

    private const string CategoryFromWhere = @"
FROM dbo.tbl_Categories c
WHERE c.Cat_Loc = @Loc
  AND c.Cat_Active = 'Y'
  AND (
        @Like IS NULL
        OR c.Cat_Code LIKE @Like
        OR c.Cat_Desc LIKE @Like
      )";

    public async Task<(IReadOnlyList<StockItemLookupDto> Items, int TotalCount)> GetStockItemsPage(
        int skip = 0,
        int take = DefaultTake,
        string? search = null)
    {
        if (take <= 0) take = DefaultTake;
        if (take > MaxTake) take = MaxTake;
        if (skip < 0) skip = 0;

        var like = BuildLikePattern(search);

        using var con = Con();

        var countSql = "SELECT COUNT(*) " + StockFromWhere;
        var totalCount = await con.ExecuteScalarAsync<int>(countSql, new { Loc = _loc, Like = like });

        const string selectList = @"
SELECT
    CAST(s.Stk_StkId AS int)                                      AS STK_RECID,
    s.Stk_Supplier + '/' + s.Stk_Category + '/' + s.Stk_Serial    AS STK_REF,
    s.Stk_Desc                                                    AS STK_DESC,
    ISNULL(s.Stk_Barcode1, '')                                    AS DBAR_BARCODE,
    ISNULL(s.Stk_UnitCode, '')                                    AS STK_UNIT";

        var dataSql = selectList + StockFromWhere + @"
ORDER BY s.Stk_Supplier, s.Stk_Category, s.Stk_Serial, s.Stk_StkId
OFFSET @Skip ROWS FETCH NEXT @Take ROWS ONLY";

        var rows = (await con.QueryAsync<StockItemLookupDto>(dataSql, new
        {
            Loc = _loc,
            Skip = skip,
            Take = take,
            Like = like,
        })).ToList();

        return (rows, totalCount);
    }

    /// <summary>Categories page (replaces the ERP product groups).</summary>
    public async Task<(IReadOnlyList<ProductGroupLookupDto> Items, int TotalCount)> GetProductGroupsPage(
        int skip = 0,
        int take = DefaultTake,
        string? search = null)
    {
        if (take <= 0) take = DefaultTake;
        if (take > MaxTake) take = MaxTake;
        if (skip < 0) skip = 0;

        var like = BuildLikePattern(search);

        using var con = Con();

        var countSql = "SELECT COUNT(*) " + CategoryFromWhere;
        var totalCount = await con.ExecuteScalarAsync<int>(countSql, new { Loc = _loc, Like = like });

        var selectList = $@"
SELECT
    {SuperStoreKeys.SqlIdExpression("c.Cat_Code")} AS IT_RecID,
    c.Cat_Code                 AS IT_Code,
    ISNULL(c.Cat_Desc, '')     AS IT_DESC,
    ''                         AS GRP_CODE,
    ''                         AS GRP_DESC";

        var dataSql = selectList + CategoryFromWhere + @"
ORDER BY c.Cat_Code
OFFSET @Skip ROWS FETCH NEXT @Take ROWS ONLY";

        var rows = (await con.QueryAsync<ProductGroupLookupDto>(dataSql, new
        {
            Loc = _loc,
            Skip = skip,
            Take = take,
            Like = like,
        })).ToList();

        return (rows, totalCount);
    }

    /// <summary>
    /// Every active stock item matching the search, in one round trip ("Add all" in the picker).
    /// </summary>
    public async Task<IReadOnlyList<StockItemLookupDto>> GetAllStockItems(string? search = null)
    {
        using var con = Con();
        return (await con.QueryAsync<StockItemLookupDto>(@"
SELECT
    CAST(s.Stk_StkId AS int)                                      AS STK_RECID,
    s.Stk_Supplier + '/' + s.Stk_Category + '/' + s.Stk_Serial    AS STK_REF,
    s.Stk_Desc                                                    AS STK_DESC,
    ISNULL(s.Stk_Barcode1, '')                                    AS DBAR_BARCODE,
    ISNULL(s.Stk_UnitCode, '')                                    AS STK_UNIT" + StockFromWhere + @"
ORDER BY s.Stk_Supplier, s.Stk_Category, s.Stk_Serial, s.Stk_StkId",
            new { Loc = _loc, Like = BuildLikePattern(search) }, commandTimeout: 120)).ToList();
    }

    /// <summary>Every active category matching the search ("Add all" in the picker).</summary>
    public async Task<IReadOnlyList<ProductGroupLookupDto>> GetAllCategories(string? search = null)
    {
        using var con = Con();
        return (await con.QueryAsync<ProductGroupLookupDto>($@"
SELECT
    {SuperStoreKeys.SqlIdExpression("c.Cat_Code")} AS IT_RecID,
    c.Cat_Code                 AS IT_Code,
    ISNULL(c.Cat_Desc, '')     AS IT_DESC,
    ''                         AS GRP_CODE,
    ''                         AS GRP_DESC" + CategoryFromWhere + @"
ORDER BY c.Cat_Code",
            new { Loc = _loc, Like = BuildLikePattern(search) })).ToList();
    }

    /// <summary>
    /// SuperStore has no POS cash register step for purchase rebates: only the configured
    /// location is validated (Com_Location); the cash-register flag is always reported valid.
    /// </summary>
    public async Task<LocationCashRegStatusDto> GetLocationCashRegStatusAsync()
    {
        var locationValid = false;

        using var con = Con();
        if (!string.IsNullOrWhiteSpace(_loc))
        {
            locationValid = await con.ExecuteScalarAsync<int?>(
                "SELECT 1 FROM Com_Location WHERE Loc_Code = @LocationCode",
                new { LocationCode = _loc }) == 1;
        }

        return new LocationCashRegStatusDto
        {
            LocationValid = locationValid,
            CashRegValid = true,
        };
    }

    /// <summary>
    /// Latest date a purchase invoice was posted to accounting (tbl_PurInvHeader.Pih_GenAcc).
    /// </summary>
    public async Task<DateTime?> GetLastAccountingGenerationDateAsync()
    {
        using var con = Con();
        return await con.ExecuteScalarAsync<DateTime?>(
            "SELECT MAX(Pih_GenAcc) FROM tbl_PurInvHeader WHERE Pih_Loc = @Loc",
            new { Loc = _loc });
    }

    private static string? BuildLikePattern(string? search)
    {
        if (string.IsNullOrWhiteSpace(search))
            return null;
        var t = search.Trim();
        if (t.Length == 0)
            return null;
        t = t.Replace("[", "[[]").Replace("%", "[%]").Replace("_", "[_]");
        return "%" + t + "%";
    }
}
