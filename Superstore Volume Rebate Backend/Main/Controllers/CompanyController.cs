using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

/// <summary>
/// Company identity for exports and reports.
/// GET /api/Company/info → { comp_Code, comp_Name, comp_AbrName }
/// GET /api/Company/logo → the logo image (COm_Logo.L_Img), 204 when there is none
/// </summary>
[Route("api/[controller]")]
[ApiController]
[Authorize]
public class CompanyController : ControllerBase
{
    private readonly COM_CompanyDAL _dal;

    public CompanyController(COM_CompanyDAL dal) => _dal = dal;

    [HttpGet("info")]
    public async Task<IActionResult> GetInfo() => Ok(await _dal.GetCompanyInfo() ?? new CompanyInfoDto());

    [HttpGet("logo")]
    public async Task<IActionResult> GetLogo()
    {
        var bytes = await _dal.GetLogoAsync();
        if (bytes == null || bytes.Length == 0) return NoContent();
        return File(bytes, SniffImageType(bytes));
    }

    private static string SniffImageType(byte[] b) =>
        b.Length > 3 && b[0] == 0x89 && b[1] == 0x50 ? "image/png"
        : b.Length > 2 && b[0] == 0xFF && b[1] == 0xD8 ? "image/jpeg"
        : b.Length > 2 && b[0] == 0x47 && b[1] == 0x49 ? "image/gif"
        : "image/bmp";
}
