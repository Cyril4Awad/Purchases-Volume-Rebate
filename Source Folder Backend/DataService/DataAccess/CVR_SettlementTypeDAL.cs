using Dapper;
using DataService.Models.DTOs;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

public class CVRSettlementTypeDAL
{
    private readonly IConfiguration _config;
    public CVRSettlementTypeDAL(IConfiguration config) => _config = config;

    private SqlConnection Con() =>
        new SqlConnection(_config.GetConnectionString("Constr"));

    public async Task<IEnumerable<dynamic>> GetAll()
    {
        using var con = Con();
        return await con.QueryAsync("SELECT * FROM CVR_SettlementTypes ORDER BY STT_SettlementTypeID");
    }

    public async Task<int> Insert(CVR_SettlementTypeDto dto, string user)
    {
        using var con = Con();
        return await con.ExecuteAsync(@"
            INSERT INTO CVR_SettlementTypes
                (STT_SettlementTypeName, STT_PeriodLength, STT_IsCustom,
                 STT_Remarks, STT_Active, STT_CDStamp, STT_CUStamp, STT_MDStamp, STT_MUStamp)
            VALUES
                (@SettlementTypeName, @PeriodLength, @IsCustom,
                 @Remarks, @Active, GETDATE(), @User, GETDATE(), @User)",
            new
            {
                dto.SettlementTypeName,
                dto.PeriodLength,
                dto.IsCustom,
                dto.Remarks,
                dto.Active,
                User = user
            });
    }

    public async Task<int> Update(decimal id, CVR_SettlementTypeDto dto, string user)
    {
        using var con = Con();
        return await con.ExecuteAsync(@"
            UPDATE CVR_SettlementTypes SET
                STT_SettlementTypeName = @SettlementTypeName,
                STT_PeriodLength       = @PeriodLength,
                STT_IsCustom           = @IsCustom,
                STT_Remarks            = @Remarks,
                STT_Active             = @Active,
                STT_MDStamp            = GETDATE(),
                STT_MUStamp            = @User
            WHERE STT_SettlementTypeID = @Id",
            new
            {
                Id = id,
                dto.SettlementTypeName,
                dto.PeriodLength,
                dto.IsCustom,
                dto.Remarks,
                dto.Active,
                User = user
            });
    }

    public async Task<int> Delete(decimal id)
    {
        using var con = Con();
        return await con.ExecuteAsync(
            "DELETE FROM CVR_SettlementTypes WHERE STT_SettlementTypeID = @Id",
            new { Id = id });
    }

    /// <summary>
    /// Applies deletes, then updates, then inserts in one transaction, then rejects the
    /// whole save if two settlement types end up with the same name.
    /// </summary>
    public async Task SaveChanges(CVR_SettlementTypeSaveChangesDto changes, string user)
    {
        using var con = Con();
        await con.OpenAsync();
        using var transaction = con.BeginTransaction();

        try
        {
            if (changes.Deletes.Count > 0)
            {
                await con.ExecuteAsync(
                    "DELETE FROM CVR_SettlementTypes WHERE STT_SettlementTypeID IN @Ids",
                    new { Ids = changes.Deletes },
                    transaction);
            }

            foreach (var item in changes.Updates)
            {
                await con.ExecuteAsync(@"
                    UPDATE CVR_SettlementTypes SET
                        STT_SettlementTypeName = @SettlementTypeName,
                        STT_PeriodLength       = @PeriodLength,
                        STT_IsCustom           = @IsCustom,
                        STT_Remarks            = @Remarks,
                        STT_Active             = @Active,
                        STT_MDStamp            = GETDATE(),
                        STT_MUStamp            = @User
                    WHERE STT_SettlementTypeID = @SettlementTypeID",
                    new { item.SettlementTypeID, item.SettlementTypeName, item.PeriodLength, item.IsCustom, item.Remarks, item.Active, User = user },
                    transaction);
            }

            foreach (var item in changes.Inserts)
            {
                await con.ExecuteAsync(@"
                    INSERT INTO CVR_SettlementTypes
                        (STT_SettlementTypeName, STT_PeriodLength, STT_IsCustom,
                         STT_Remarks, STT_Active, STT_CDStamp, STT_CUStamp, STT_MDStamp, STT_MUStamp)
                    VALUES
                        (@SettlementTypeName, @PeriodLength, @IsCustom,
                         @Remarks, @Active, GETDATE(), @User, GETDATE(), @User)",
                    new { item.SettlementTypeName, item.PeriodLength, item.IsCustom, item.Remarks, item.Active, User = user },
                    transaction);
            }

            var duplicate = await con.ExecuteScalarAsync<string?>(@"
                SELECT TOP 1 MIN(STT_SettlementTypeName)
                FROM CVR_SettlementTypes
                GROUP BY LOWER(LTRIM(RTRIM(STT_SettlementTypeName)))
                HAVING COUNT(*) > 1",
                transaction: transaction);

            if (duplicate != null)
                throw new DataService.Others.ValidationException($"A settlement type named \"{duplicate.Trim()}\" already exists.");

            transaction.Commit();
        }
        catch
        {
            transaction.Rollback();
            throw;
        }
    }
}