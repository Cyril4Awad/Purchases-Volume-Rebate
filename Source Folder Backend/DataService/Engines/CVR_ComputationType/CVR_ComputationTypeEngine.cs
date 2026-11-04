using DataService.Models.DTOs;

public class CVRComputationTypeEngine
{
    private readonly CVRComputationTypeDAL _dal;
    public CVRComputationTypeEngine(CVRComputationTypeDAL dal) => _dal = dal;

    public Task<IEnumerable<dynamic>> GetAll() => _dal.GetAll();
    public Task<int> Create(CVR_ComputationTypeDto dto, string user) => _dal.Insert(dto, user);
    public Task<int> Update(decimal id, CVR_ComputationTypeDto dto, string user) => _dal.Update(id, dto, user);
    public Task<int> Delete(decimal id) => _dal.Delete(id);

    public async Task<IEnumerable<dynamic>> SaveChanges(CVR_ComputationTypeSaveChangesDto changes, string user)
    {
        changes.Inserts ??= new();
        changes.Updates ??= new();
        changes.Deletes ??= new();

        foreach (var item in changes.Inserts.Concat(changes.Updates))
        {
            item.ComputationTypeName = item.ComputationTypeName?.Trim() ?? "";
            item.Remarks = string.IsNullOrWhiteSpace(item.Remarks) ? null : item.Remarks.Trim();

            if (item.ComputationTypeName.Length == 0)
                throw new DataService.Others.ValidationException("Computation type name is required.");
            if (item.PeriodLength < 1 || item.PeriodLength > 12)
                throw new DataService.Others.ValidationException($"Period length for \"{item.ComputationTypeName}\" must be between 1 and 12 months.");
        }

        if (changes.Updates.Any(u => u.ComputationTypeID is null or <= 0))
            throw new DataService.Others.ValidationException("An updated computation type is missing its ID.");

        await _dal.SaveChanges(changes, user);
        return await _dal.GetAll();
    }
}