using DataService.Models;
using DataService.Models.DTOs;
using Microsoft.Data.SqlClient;

public class CVRTypeEngine
{
    private readonly CVRTypeDAL _dal;

    public CVRTypeEngine(CVRTypeDAL dal)
    {
        _dal = dal;
    }

    public Task<IEnumerable<CVR_Type>> GetAll()
    {
        return _dal.GetAll();
    }

    public Task<int> Create(CVR_TypeDto dto, string user)
    {
        return _dal.Insert(dto, user);
    }

    public Task<int> Update(decimal id, CVR_TypeDto dto, string user)
    {
        return _dal.Update(id, dto, user);
    }

    public Task<int> Delete(decimal id)
    {
        return _dal.Delete(id);
    }
    public async Task<IEnumerable<CVR_Type>> SaveChanges(CVR_TypeSaveChangesDto changes, string user)
    {
        changes.Inserts ??= new();
        changes.Updates ??= new();
        changes.Deletes ??= new();

        foreach (var item in changes.Inserts.Concat(changes.Updates))
        {
            item.TypeName = item.TypeName?.Trim() ?? "";
            item.Behavior = item.Behavior?.Trim().ToUpperInvariant() ?? "";
            item.Remarks = string.IsNullOrWhiteSpace(item.Remarks) ? null : item.Remarks.Trim();

            if (item.TypeName.Length == 0)
                throw new DataService.Others.ValidationException("Rebate type name is required.");
            if (item.Behavior != "M" && item.Behavior != "A")
                throw new DataService.Others.ValidationException($"Behavior is required for \"{item.TypeName}\".");
        }

        if (changes.Updates.Any(u => u.TypeID is null or <= 0))
            throw new DataService.Others.ValidationException("An updated rebate type is missing its ID.");

        await _dal.SaveChanges(changes, user);
        return await _dal.GetAll();
    }

    public async Task<int> BulkSave(List<CVR_TypeDto> list, string user)
    {
        return await _dal.BulkSave(list, user);
    }

}