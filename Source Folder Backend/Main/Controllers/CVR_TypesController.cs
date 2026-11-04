using DataService.Models.DTOs;
using Main.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

[Route("api/[controller]")]
[ApiController]
[Authorize]
public class CVRTypesController : ControllerBase, IActionFilter
{
    [NonAction]
    public void OnActionExecuting(ActionExecutingContext context) { }

    [NonAction]
    public void OnActionExecuted(ActionExecutedContext context)
    {
        // No dashboard cache in this app yet (the reference invalidates it here).
    }

    private readonly CVRTypeEngine _engine;
    private readonly UserTenantContextProvider _userProvider;

    public CVRTypesController(CVRTypeEngine engine, UserTenantContextProvider userProvider)
    {
        _engine = engine;
        _userProvider = userProvider;
    }

    [HttpGet]
    public async Task<IActionResult> Get()
    {
        return Ok(await _engine.GetAll());
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CVR_TypeDto dto)
    {
        var user = _userProvider.GetCurrentContextAsync();
        return Ok(await _engine.Create(dto, user.User_Code));
    }

    /// <summary>Applies inserts, updates and deletes atomically; returns the refreshed list.</summary>
    [HttpPost("save-changes")]
    public async Task<IActionResult> SaveChanges([FromBody] CVR_TypeSaveChangesDto changes)
    {
        var user = _userProvider.GetCurrentContextAsync();
        return Ok(await _engine.SaveChanges(changes, user.User_Code));
    }

    [HttpPost("bulk-save")]
    public async Task<IActionResult> BulkSave([FromBody] List<CVR_TypeDto> list)
    {
        var user = _userProvider.GetCurrentContextAsync();
        await _engine.BulkSave(list, user.User_Code);
        return Ok();
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(decimal id, [FromBody] CVR_TypeDto dto)
    {
        var user = _userProvider.GetCurrentContextAsync();
        return Ok(await _engine.Update(id, dto, user.User_Code));
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(decimal id)
    {
        return Ok(await _engine.Delete(id));
    }
}
