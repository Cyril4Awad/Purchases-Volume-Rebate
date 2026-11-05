using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

public class CompanyInfoDto
{
    public string? Comp_Code { get; set; }
    public string? Comp_Name { get; set; }
    public string? Comp_AbrName { get; set; }
}

/// <summary>Company identity and logo (SuperStore Com_Company / COm_Logo) for exports and reports.</summary>
public class COM_CompanyDAL
{
    private readonly IConfiguration _config;
    public COM_CompanyDAL(IConfiguration config) => _config = config;

    private SqlConnection Con() => new SqlConnection(_config.GetConnectionString("Constr"));

    public async Task<CompanyInfoDto?> GetCompanyInfo()
    {
        using var con = Con();
        return await con.QueryFirstOrDefaultAsync<CompanyInfoDto>(
            "SELECT TOP 1 Comp_Code, Comp_Name, Comp_AbrName FROM Com_Company ORDER BY Comp_Code");
    }

    /// <summary>
    /// The company logo as stored (usually a bitmap): SuperStore keeps it in tbl_SystemFile.Sf_Logo
    /// (per location); COm_Logo.L_Img is the fallback. Null when there is none.
    /// </summary>
    public async Task<byte[]?> GetLogoAsync()
    {
        var loc = string.IsNullOrWhiteSpace(_config["Location"]) ? "01" : _config["Location"]!.Trim();
        using var con = Con();
        var logo = await con.ExecuteScalarAsync<byte[]?>(@"
SELECT TOP 1 Sf_Logo FROM tbl_SystemFile
WHERE Sf_Logo IS NOT NULL
ORDER BY CASE WHEN Sf_Loc = @Loc THEN 0 ELSE 1 END, Sf_Loc", new { Loc = loc });
        if (logo is { Length: > 0 }) return logo;

        return await con.ExecuteScalarAsync<byte[]?>(@"
SELECT TOP 1 L_Img FROM COm_Logo
WHERE L_Img IS NOT NULL
ORDER BY CASE WHEN L_Comp = (SELECT TOP 1 Comp_Code FROM Com_Company ORDER BY Comp_Code) THEN 0 ELSE 1 END, L_Comp");
    }
}
