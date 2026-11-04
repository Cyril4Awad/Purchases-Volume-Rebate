using Dapper;
using DataService.Models;
using DataService.Models.DTOs;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

public class CVRTypeDAL
{
    private readonly IConfiguration _config;

    public CVRTypeDAL(IConfiguration config)
    {
        _config = config;
    }

    public async Task<IEnumerable<CVR_Type>> GetAll()
    {
        using var con = new SqlConnection(_config.GetConnectionString("Constr"));

        return await con.QueryAsync<CVR_Type>(
            "SELECT * FROM CVR_Types ORDER BY VRT_TypeID"
        );
    }

    public async Task<int> Insert(CVR_TypeDto dto, string user)
    {
        using var con = new SqlConnection(_config.GetConnectionString("Constr"));

        string sql = @"
        INSERT INTO CVR_Types
        (VRT_TypeName, VRT_Behavior, VRT_Remarks, VRT_Active, VRT_CDStamp, VRT_CUStamp, VRT_MDStamp, VRT_MUStamp)
        VALUES
        (@TypeName, @Behavior, @Remarks, @Active, GETDATE(), @User, GETDATE(), @User)";

        return await con.ExecuteAsync(sql, new
        {
            dto.TypeName,
            dto.Behavior,
            dto.Remarks,
            dto.Active,
            User = user
        });
    }

    public async Task<int> Update(decimal id, CVR_TypeDto dto, string user)
    {
        using var con = new SqlConnection(_config.GetConnectionString("Constr"));

        string sql = @"
        UPDATE CVR_Types
        SET 
            VRT_TypeName = @TypeName,
            VRT_Behavior = @Behavior,
            VRT_Remarks = @Remarks,
            VRT_Active = @Active,
            VRT_MDStamp = GETDATE(),
            VRT_MUStamp = @User
        WHERE VRT_TypeID = @Id";

        return await con.ExecuteAsync(sql, new
        {
            Id = id,
            dto.TypeName,
            dto.Behavior,
            dto.Remarks,
            dto.Active,
            User = user
        });
    }

    public async Task<int> Delete(decimal id)
    {
        using var con = new SqlConnection(_config.GetConnectionString("Constr"));

        return await con.ExecuteAsync(
            "DELETE FROM CVR_Types WHERE VRT_TypeID = @Id",
            new { Id = id }
        );
    }
    /// <summary>
    /// Applies deletes, then updates, then inserts in one transaction (deleting first frees names
    /// for reuse), then rejects the whole save if two types end up with the same name.
    /// </summary>
    public async Task SaveChanges(CVR_TypeSaveChangesDto changes, string user)
    {
        using var con = new SqlConnection(_config.GetConnectionString("Constr"));
        await con.OpenAsync();
        using var transaction = con.BeginTransaction();

        try
        {
            if (changes.Deletes.Count > 0)
            {
                await con.ExecuteAsync(
                    "DELETE FROM CVR_Types WHERE VRT_TypeID IN @Ids",
                    new { Ids = changes.Deletes },
                    transaction);
            }

            foreach (var item in changes.Updates)
            {
                await con.ExecuteAsync(@"
                UPDATE CVR_Types
                SET VRT_TypeName = @TypeName,
                    VRT_Behavior = @Behavior,
                    VRT_Remarks  = @Remarks,
                    VRT_Active   = @Active,
                    VRT_MDStamp  = GETDATE(),
                    VRT_MUStamp  = @User
                WHERE VRT_TypeID = @TypeID",
                new { item.TypeID, item.TypeName, item.Behavior, item.Remarks, item.Active, User = user },
                transaction);
            }

            foreach (var item in changes.Inserts)
            {
                await con.ExecuteAsync(@"
                INSERT INTO CVR_Types
                (VRT_TypeName, VRT_Behavior, VRT_Remarks, VRT_Active, VRT_CDStamp, VRT_CUStamp, VRT_MDStamp, VRT_MUStamp)
                VALUES
                (@TypeName, @Behavior, @Remarks, @Active, GETDATE(), @User, GETDATE(), @User)",
                new { item.TypeName, item.Behavior, item.Remarks, item.Active, User = user },
                transaction);
            }

            var duplicate = await con.ExecuteScalarAsync<string?>(@"
                SELECT TOP 1 MIN(VRT_TypeName)
                FROM CVR_Types
                GROUP BY LOWER(LTRIM(RTRIM(VRT_TypeName)))
                HAVING COUNT(*) > 1",
                transaction: transaction);

            if (duplicate != null)
                throw new DataService.Others.ValidationException($"A rebate type named \"{duplicate.Trim()}\" already exists.");

            transaction.Commit();
        }
        catch
        {
            transaction.Rollback();
            throw;
        }
    }

    public async Task<int> BulkSave(List<CVR_TypeDto> list, string user)
    {
        using var con = new SqlConnection(_config.GetConnectionString("Constr"));

        await con.OpenAsync();
        using var transaction = con.BeginTransaction();

        try
        {
            // optional strategy: replace all
            await con.ExecuteAsync("DELETE FROM CVR_Types", transaction: transaction);

            foreach (var item in list)
            {
                await con.ExecuteAsync(@"
                INSERT INTO CVR_Types
                (VRT_TypeName, VRT_Behavior, VRT_Remarks, VRT_Active, VRT_CDStamp, VRT_CUStamp, VRT_MDStamp, VRT_MUStamp)
                VALUES
                (@TypeName, @Behavior, @Remarks, @Active, GETDATE(), @User, GETDATE(), @User)",
                new
                {
                    item.TypeName,
                    item.Behavior,
                    item.Remarks,
                    item.Active,
                    User = user
                },
                transaction);
            }

            transaction.Commit();
            return 1;
        }
        catch
        {
            transaction.Rollback();
            throw;
        }
    }
}