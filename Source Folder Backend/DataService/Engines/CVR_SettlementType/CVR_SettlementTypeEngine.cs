using DataService.Models.DTOs;

public class CVRSettlementTypeEngine
{
    private readonly CVRSettlementTypeDAL _dal;
    public CVRSettlementTypeEngine(CVRSettlementTypeDAL dal) => _dal = dal;

    public Task<IEnumerable<dynamic>> GetAll() => _dal.GetAll();
    public Task<int> Create(CVR_SettlementTypeDto dto, string user) =>
        ValidateAndInsert(dto, user);

    public Task<int> Update(decimal id, CVR_SettlementTypeDto dto, string user) =>
        ValidateAndUpdate(id, dto, user);

    private static void ValidatePeriodLength(CVR_SettlementTypeDto dto)
    {
        if (dto.PeriodLength < 1 || dto.PeriodLength > 12)
            throw new InvalidOperationException("Period length must be between 1 and 12 months.");
    }

    private Task<int> ValidateAndInsert(CVR_SettlementTypeDto dto, string user)
    {
        ValidatePeriodLength(dto);
        return _dal.Insert(dto, user);
    }

    private Task<int> ValidateAndUpdate(decimal id, CVR_SettlementTypeDto dto, string user)
    {
        ValidatePeriodLength(dto);
        return _dal.Update(id, dto, user);
    }
    public Task<int> Delete(decimal id) => _dal.Delete(id);

    public async Task<IEnumerable<dynamic>> SaveChanges(CVR_SettlementTypeSaveChangesDto changes, string user)
    {
        changes.Inserts ??= new();
        changes.Updates ??= new();
        changes.Deletes ??= new();

        foreach (var item in changes.Inserts.Concat(changes.Updates))
        {
            item.SettlementTypeName = item.SettlementTypeName?.Trim() ?? "";
            item.Remarks = string.IsNullOrWhiteSpace(item.Remarks) ? null : item.Remarks.Trim();

            if (item.SettlementTypeName.Length == 0)
                throw new DataService.Others.ValidationException("Settlement type name is required.");
            if (item.PeriodLength < 1 || item.PeriodLength > 12)
                throw new DataService.Others.ValidationException($"Period length for \"{item.SettlementTypeName}\" must be between 1 and 12 months.");
        }

        if (changes.Updates.Any(u => u.SettlementTypeID is null or <= 0))
            throw new DataService.Others.ValidationException("An updated settlement type is missing its ID.");

        await _dal.SaveChanges(changes, user);
        return await _dal.GetAll();
    }
}