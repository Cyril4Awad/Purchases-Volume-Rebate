using Dapper;
using DataService.Models.DTOs;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

/// <summary>
/// Supplier lookups (SuperStore tbl_Suppliers). The class / DTO names are kept from the ERP
/// "clients" version so the rest of the engine is unchanged; SupCode is tbl_Suppliers.Sup_Code;
/// the location is the configured "Location" (tbl_Suppliers is keyed on Sup_Code + Sup_Loc).
/// </summary>
public class ClientsDAL
{
    private const int MaxTake = 200;
    private const int DefaultTake = 50;

    private readonly IConfiguration _config;
    private readonly string _loc;

    public ClientsDAL(IConfiguration config)
    {
        _config = config;
        _loc = string.IsNullOrWhiteSpace(config["Location"]) ? "01" : config["Location"]!.Trim();
    }

    private SqlConnection Con() =>
        new SqlConnection(_config.GetConnectionString("Constr"));

    private const string FromWhere = @"
FROM tbl_Suppliers
WHERE Sup_Loc = @Loc
  AND Sup_Active = 'Y'
  AND (@ExcludeSupplierCode IS NULL OR Sup_Code <> @ExcludeSupplierCode)
  AND (
        @Like IS NULL
        OR Sup_Name LIKE @Like
        OR Sup_Code LIKE @Like
      )";

    private const string FromWhereContractMainClients = @"
FROM tbl_Suppliers
WHERE Sup_Loc = @Loc
  AND Sup_Active = 'Y'
  AND Sup_Code IN (SELECT CTR_SupCode FROM CVR_Contracts WHERE CTR_SupLoc = @Loc)
  AND (@ExcludeSupplierCode IS NULL OR Sup_Code <> @ExcludeSupplierCode)
  AND (
        @Like IS NULL
        OR Sup_Name LIKE @Like
        OR Sup_Code LIKE @Like
      )";

    private const string SelectList = @"
SELECT
    Sup_Code                        AS SupCode,
    Sup_Code                        AS ClientCode,
    ''                              AS ClientNo,
    Sup_Name                        AS ClientName,
    ISNULL(Sup_Representative, '')  AS AE,
    ISNULL(Sup_MOFReg, '')          AS MOF,
    ISNULL(Sup_Addr, '')            AS Address,
    ISNULL(Sup_Tel, '')             AS Phone1,
    ISNULL(Sup_Mobile, '')          AS Phone2,
    ISNULL(Sup_DefaultCurr, '')     AS Categ,
    ISNULL(Sup_Payment, '')         AS ClientType";

    public async Task<(IReadOnlyList<ClientDto> Items, int TotalCount)> GetActiveClientsPage(
        int skip = 0,
        int take = DefaultTake,
        string? search = null,
        string? excludeSupCode = null,
        bool onlyContractMainClients = false)
    {
        if (take <= 0) take = DefaultTake;
        if (take > MaxTake) take = MaxTake;
        if (skip < 0) skip = 0;

        var like = BuildLikePattern(search);
        var fromWhere = onlyContractMainClients ? FromWhereContractMainClients : FromWhere;
        var excludeCode = string.IsNullOrWhiteSpace(excludeSupCode) ? null : excludeSupCode.Trim();

        using var con = Con();

        var countSql = "SELECT COUNT(*) " + fromWhere;
        var totalCount = await con.ExecuteScalarAsync<int>(countSql, new
        {
            Loc = _loc,
            ExcludeSupplierCode = excludeCode,
            Like = like,
        });

        var dataSql = SelectList + " " + fromWhere + @"
ORDER BY Sup_Code
OFFSET @Skip ROWS FETCH NEXT @Take ROWS ONLY";

        var rows = (await con.QueryAsync<ClientDto>(dataSql, new
        {
            Loc = _loc,
            Skip = skip,
            Take = take,
            ExcludeSupplierCode = excludeCode,
            Like = like,
        })).ToList();

        return (rows, totalCount);
    }

    public async Task<IReadOnlyList<ClientLookupRowDto>> LookupClientsByCodes(IEnumerable<string>? codesIn)
    {
        var codes = (codesIn ?? Enumerable.Empty<string>())
            .Where(c => !string.IsNullOrWhiteSpace(c)).Select(c => c.Trim()).Distinct().Take(2000).ToList();
        if (codes.Count == 0)
            return Array.Empty<ClientLookupRowDto>();

        using var con = Con();
        return (await con.QueryAsync<ClientLookupRowDto>(@"
SELECT Sup_Code     AS SupCode,
       Sup_Code     AS ClientCode,
       ''           AS ClientNo,
       Sup_Name     AS ClientName
FROM   tbl_Suppliers
WHERE  Sup_Loc = @Loc
  AND  Sup_Code IN @Codes",
            new { Loc = _loc, Codes = codes })).ToList();
    }

    private static string? BuildLikePattern(string? search)
    {
        if (string.IsNullOrWhiteSpace(search)) return null;
        var t = search.Trim();
        if (t.Length == 0) return null;
        t = t.Replace("[", "[[]").Replace("%", "[%]").Replace("_", "[_]");
        return "%" + t + "%";
    }
}
