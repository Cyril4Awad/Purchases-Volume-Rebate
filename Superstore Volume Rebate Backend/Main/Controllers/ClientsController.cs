using DataService.Models.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[Route("api/[controller]")]
[ApiController]
[Authorize]
public class ClientsController : ControllerBase
{
    private const int MaxTake = 200;
    private const int DefaultTake = 50;

    private readonly ClientsDAL _dal;

    public ClientsController(ClientsDAL dal) => _dal = dal;

    /// <summary>
    /// Paged clients: { items, totalCount }.
    /// Query: skip, take, search, excludeSupCode, onlyContractMainClients.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetClients(
        int skip = 0,
        int take = DefaultTake,
        string? search = null,
        string? excludeSupCode = null,
        bool onlyContractMainClients = false)
    {
        if (take <= 0) take = DefaultTake;
        if (take > MaxTake) take = MaxTake;
        if (skip < 0) skip = 0;

        var (items, totalCount) = await _dal.GetActiveClientsPage(
            skip,
            take,
            string.IsNullOrWhiteSpace(search) ? null : search.Trim(),
            excludeSupCode,
            onlyContractMainClients);

        return Ok(new { items, totalCount });
    }

    /// <summary>
    /// Resolve supplier code → name for grids (bounded list of codes).
    /// </summary>
    [HttpPost("lookup")]
    public async Task<IActionResult> Lookup([FromBody] ClientLookupRequest? body)
    {
        var rows = await _dal.LookupClientsByCodes(body?.Codes);
        return Ok(rows);
    }
}