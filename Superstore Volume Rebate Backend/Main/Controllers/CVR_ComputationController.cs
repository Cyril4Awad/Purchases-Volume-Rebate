using DataService.Models.DTOs;
using Main.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[Route("api/[controller]")]
[ApiController]
[Authorize]
public class CVRComputationController : ControllerBase
{
    private readonly CVRComputationEngine _engine;
    private readonly CVRSavedComputationEngine _savedEngine;
    private readonly UserTenantContextProvider _userProvider;

    public CVRComputationController(
        CVRComputationEngine engine,
        CVRSavedComputationEngine savedEngine,
        UserTenantContextProvider userProvider)
    {
        _engine = engine;
        _savedEngine = savedEngine;
        _userProvider = userProvider;
    }

    /// <summary>Supplier codes from a request: trimmed, non-empty, distinct.</summary>
    private static List<string> CleanCodes(IEnumerable<string>? codes) =>
        (codes ?? Enumerable.Empty<string>())
            .Where(c => !string.IsNullOrWhiteSpace(c))
            .Select(c => c.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

    /// <summary>
    /// Returns aggregated sales for a target across all specified suppliers.
    /// GET /api/CVRComputation/sales?supCodes=0001,0002&targetId=5
    /// </summary>
    [HttpGet("sales")]
    public async Task<IActionResult> GetSales(
        [FromQuery] string supCodes,
        [FromQuery] int targetId)
    {
        if (string.IsNullOrWhiteSpace(supCodes) || targetId <= 0)
            return BadRequest("supCodes and targetId are required.");

        var ids = CleanCodes(supCodes.Split(',', StringSplitOptions.RemoveEmptyEntries));

        if (ids.Count == 0)
            return BadRequest("At least one valid supCode is required.");

        var result = await _engine.GetTargetSalesAsync(ids, targetId);
        if (result == null)
            return NotFound($"Target {targetId} was not found.");

        return Ok(result);
    }

    /// <summary>
    /// Returns aggregated sales for multiple targets in one request.
    /// POST /api/CVRComputation/sales-batch
    /// </summary>
    [HttpPost("sales-batch")]
    public async Task<IActionResult> GetSalesBatch([FromBody] SalesBatchRequest request)
    {
        if (request?.SupCodes == null || !request.SupCodes.Any())
            return BadRequest("supCodes are required.");
        if (request.TargetIds == null || !request.TargetIds.Any())
            return BadRequest("targetIds are required.");

        var ids = CleanCodes(request.SupCodes);

        if (ids.Count == 0)
            return BadRequest("At least one valid supCode is required.");

        var tIds = request.TargetIds
            .Where(n => n > 0)
            .Distinct()
            .ToList();

        if (tIds.Count == 0)
            return BadRequest("At least one valid targetId is required.");

        if (tIds.Count > 50)
            return BadRequest("A maximum of 50 targetIds is allowed per request.");

        var result = await _engine.GetTargetSalesBatchAsync(ids, tIds);
        return Ok(result);
    }

    /// <summary>
    /// Returns item-level sales breakdown for a target across all specified suppliers.
    /// GET /api/CVRComputation/items?supCodes=0001,0002&targetId=5
    /// </summary>
    [HttpGet("items")]
    public async Task<IActionResult> GetItems(
        [FromQuery] string supCodes,
        [FromQuery] int targetId)
    {
        if (string.IsNullOrWhiteSpace(supCodes) || targetId <= 0)
            return BadRequest("supCodes and targetId are required.");

        var ids = CleanCodes(supCodes.Split(',', StringSplitOptions.RemoveEmptyEntries));

        if (ids.Count == 0)
            return BadRequest("At least one valid supCode is required.");

        var result = await _engine.GetTargetItemsAsync(ids, targetId);
        if (result == null)
            return NotFound($"Target {targetId} was not found.");

        return Ok(result);
    }

    /// <summary>
    /// Returns total unscoped sales for a date range across all specified suppliers (used for fee computation).
    /// POST /api/CVRComputation/totalsales
    /// </summary>
    [HttpPost("totalsales")]
    public async Task<IActionResult> GetTotalSales([FromBody] TotalSalesRequest request)
    {
        if (request?.SupCodes == null || !request.SupCodes.Any())
            return BadRequest("supCodes is required.");
        if (string.IsNullOrWhiteSpace(request.FromDate) || string.IsNullOrWhiteSpace(request.ToDate))
            return BadRequest("fromDate and toDate are required.");
        if (!DateTime.TryParse(request.FromDate, out var parsedFrom) || !DateTime.TryParse(request.ToDate, out var parsedTo))
            return BadRequest("Invalid date format for fromDate or toDate.");
        if (parsedTo < parsedFrom)
            return BadRequest("toDate must be >= fromDate.");

        var ids = CleanCodes(request.SupCodes);

        if (ids.Count == 0)
            return BadRequest("At least one valid supCode is required.");

        var result = await _engine.GetTotalClientSalesAsync(ids, parsedFrom, parsedTo);
        return Ok(result);
    }

    /// <summary>
    /// Returns aggregated sales for plan-editor simulation using draft target date ranges.
    /// POST /api/CVRComputation/sales-batch-preview
    /// </summary>
    /// <summary>
    /// Simulation breakdown: purchases by supplier × item × month for a target window (+ previous year).
    /// POST /api/CVRComputation/breakdown { supCodes, fromDate, toDate (exclusive), stockIds?, categoryIds? }
    /// </summary>
    [HttpPost("breakdown")]
    public async Task<IActionResult> GetBreakdown([FromBody] CVR_BreakdownRequest request)
    {
        var ids = CleanCodes(request?.SupCodes);
        if (ids.Count == 0) return BadRequest("At least one valid supplier is required.");
        if (!DateTime.TryParse(request!.FromDate, out var from) || !DateTime.TryParse(request.ToDate, out var to))
            return BadRequest("fromDate and toDate are required.");
        if (to <= from) return BadRequest("toDate must be after fromDate.");
        return Ok(await _engine.GetPurchaseBreakdownAsync(ids, from, to, request.StockIds, request.CategoryIds));
    }

    [HttpPost("sales-batch-preview")]
    public async Task<IActionResult> GetSalesBatchPreview([FromBody] CVR_SalesBatchPreviewRequest request)
    {
        if (request?.SupCodes == null || request.SupCodes.Count == 0)
            return BadRequest("supCodes are required.");
        if (request.Targets == null || request.Targets.Count == 0)
            return BadRequest("targets are required.");
        if (request.Targets.Count > 50)
            return BadRequest("A maximum of 50 targets is allowed per request.");

        var ids = CleanCodes(request.SupCodes);

        if (ids.Count == 0)
            return BadRequest("At least one valid supCode is required.");

        foreach (var t in request.Targets)
        {
            if (t.FromDate == default || t.ToDate == default)
                return BadRequest("Each target requires fromDate and toDate.");
            if (t.ToDate.Date < t.FromDate.Date)
                return BadRequest("Each target toDate must be >= fromDate.");
            if (string.IsNullOrWhiteSpace(t.LocalKey) && (!t.TargetId.HasValue || t.TargetId <= 0))
                return BadRequest("Each target requires targetId or localKey.");
        }

        var result = await _engine.GetTargetSalesPreviewBatchAsync(ids, request.Targets);
        return Ok(result);
    }

    /// <summary>
    /// Batched lock status for contracts. GET /api/CVRComputation/lock-status?contractIds=1,2,3
    /// </summary>
    [HttpGet("lock-status")]
    public async Task<IActionResult> GetLockStatus([FromQuery] string contractIds)
    {
        if (string.IsNullOrWhiteSpace(contractIds))
            return BadRequest("contractIds is required.");

        var ids = contractIds
            .Split(',', StringSplitOptions.RemoveEmptyEntries)
            .Select(s => long.TryParse(s.Trim(), out var n) ? n : 0L)
            .Where(n => n > 0)
            .Distinct()
            .ToList();

        if (ids.Count == 0)
            return BadRequest("At least one valid contractId is required.");

        var status = await _savedEngine.GetLockStatusBatchAsync(ids);
        var response = status.ToDictionary(
            kv => kv.Key.ToString(),
            kv => kv.Value);
        return Ok(response);
    }

    /// <summary>
    /// Saves computation figures and client sales snapshots for all targets/fees on a plan.
    /// POST /api/CVRComputation/save
    /// </summary>
    [HttpPost("save")]
    public async Task<IActionResult> SaveComputations([FromBody] CVR_SaveComputationRequest request)
    {
        if (request == null || request.PlanId <= 0)
            return BadRequest("planId is required.");

        try
        {
            var user = _userProvider.GetCurrentContextAsync();
            var result = await _savedEngine.SavePlanComputationsAsync(request.PlanId, user.User_Code);
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
    }
}

public class TotalSalesRequest
{
    public List<string> SupCodes { get; set; } = new();
    public string FromDate { get; set; } = "";
    public string ToDate { get; set; } = "";
}

public class SalesBatchRequest
{
    public List<string> SupCodes { get; set; } = new();
    public List<int> TargetIds { get; set; } = new();
}