using System.Text;

/// <summary>
/// Categories only: SuperStore identifies categories (tbl_Categories.Cat_Code, varchar(3)) by a
/// short code, while the target references (TRF_ProductGroupID) and the UI work with an integer id
/// (built on the ERP's numeric IT_RecID). Suppliers no longer use this: they are stored and passed
/// as Sup_Code + Sup_Loc.
///
/// The code is mapped to a stable, reversible int: its 4 ASCII bytes (right-padded with spaces)
/// read as a big-endian int. This is the same value SQL Server produces with
/// <see cref="SqlIdExpression"/>, so SQL and C# always agree.
///   '0001' -> 808464433, 'ART' -> 1095914528
/// </summary>
public static class SuperStoreKeys
{
    private const int Width = 4;

    /// <summary>T-SQL expression that turns a code column into its int id.</summary>
    public static string SqlIdExpression(string codeColumn) =>
        $"CAST(CAST(LEFT({codeColumn} + '    ', 4) AS binary(4)) AS int)";

    /// <summary>T-SQL expression that turns an int id column back into its code.</summary>
    public static string SqlCodeExpression(string idColumn) =>
        $"RTRIM(CAST(CAST(CAST({idColumn} AS int) AS binary(4)) AS varchar(4)))";

    public static int ToId(string? code)
    {
        var padded = (code ?? string.Empty).PadRight(Width).Substring(0, Width);
        var bytes = Encoding.ASCII.GetBytes(padded);
        return (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];
    }

    public static string ToCode(long id)
    {
        var v = unchecked((uint)id);
        var bytes = new[]
        {
            (byte)(v >> 24), (byte)(v >> 16), (byte)(v >> 8), (byte)v,
        };
        return Encoding.ASCII.GetString(bytes).TrimEnd(' ', '\0');
    }

    public static List<string> ToCodes(IEnumerable<int>? ids) =>
        ids?.Where(i => i > 0).Select(i => ToCode(i)).Distinct().ToList() ?? new List<string>();

    public static List<string> ToCodes(IEnumerable<long>? ids) =>
        ids?.Where(i => i > 0).Select(ToCode).Distinct().ToList() ?? new List<string>();
}
