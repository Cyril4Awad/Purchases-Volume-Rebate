using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Data.SqlClient;

namespace DataService.Others
{
    public class NotFoundException : Exception
    {
        public NotFoundException(string message) : base(message) { }
    }
    public class ValidationException : Exception
    {
        public ValidationException(string message) : base(message) { }
    }
    public class UnauthorizedAccessException : Exception
    {
        public UnauthorizedAccessException(string message) : base(message) { }
    }
    public class InternalServerErrorException : Exception
    {
        public InternalServerErrorException(string message) : base(message) { }
    }
    /// <summary>
    /// Every error leaves the API as { error: "message a user can act on" }. Messages written
    /// for users (validation, business rules, POS checks) pass through; database, network and
    /// unexpected errors are logged in full on the server and replaced by a plain message, so
    /// no SQL or stack details reach the screen.
    /// </summary>
    public class GlobalExceptionFilter : IExceptionFilter
    {
        public const string Unexpected = "Something went wrong. Try again, and if it keeps happening contact support.";
        public const string DatabaseUnavailable = "The server can't reach the database right now. Wait a moment and try again.";
        public const string DatabaseBusy = "The database was busy and the operation was cancelled. Nothing was saved; try again.";

        public void OnException(ExceptionContext context)
        {
            var ex = context.Exception;
            var (statusCode, message, log) = Describe(ex);
            if (log)
                Console.Error.WriteLine($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {context.HttpContext.Request.Method} {context.HttpContext.Request.Path}: {ex}");

            context.Result = new ObjectResult(new { error = message }) { StatusCode = statusCode };
            context.ExceptionHandled = true;
        }

        private static (int Status, string Message, bool Log) Describe(Exception ex)
        {
            // the real cause of wrapped errors (e.g. a SqlException inside an aggregate)
            var inner = ex is AggregateException agg ? agg.Flatten().InnerException ?? ex : ex;
            var sql = inner as SqlException ?? inner.InnerException as SqlException;
            if (sql != null)
                return MapSql(sql);

            switch (inner)
            {
                case NotFoundException:
                    return (StatusCodes.Status404NotFound, inner.Message, false);
                case ValidationException:
                    return (StatusCodes.Status400BadRequest, inner.Message, false);
                case UnauthorizedAccessException:
                    return (StatusCodes.Status401Unauthorized, inner.Message, false);
                case TimeoutException:
                case TaskCanceledException:
                case OperationCanceledException:
                    return (StatusCodes.Status503ServiceUnavailable, DatabaseUnavailable, true);
                case InvalidOperationException ioe when IsUserMessage(ioe):
                    return (StatusCodes.Status400BadRequest, PosMessages.Explain(ioe.Message), false);
                default:
                    return (StatusCodes.Status500InternalServerError, Unexpected, true);
            }
        }

        /// <summary>
        /// Our own InvalidOperationExceptions carry messages for users; ones thrown inside .NET
        /// (e.g. "Sequence contains no elements") are bugs and get the generic message.
        /// </summary>
        private static bool IsUserMessage(InvalidOperationException ex)
        {
            if (string.IsNullOrWhiteSpace(ex.Message)) return false;
            var ns = ex.TargetSite?.DeclaringType?.Namespace ?? "";
            return !(ns.StartsWith("System", StringComparison.Ordinal) || ns.StartsWith("Microsoft", StringComparison.Ordinal) || ns.StartsWith("Dapper", StringComparison.Ordinal));
        }

        private static (int, string, bool) MapSql(SqlException ex)
        {
            foreach (SqlError err in ex.Errors)
            {
                switch (err.Number)
                {
                    // connection, login, network, timeout
                    case -2: case -1: case 2: case 53: case 40: case 121: case 233: case 258:
                    case 4060: case 18456: case 10053: case 10054: case 10060: case 10061: case 11001:
                        return (StatusCodes.Status503ServiceUnavailable, DatabaseUnavailable, true);
                    case 1205: // deadlock victim
                        return (StatusCodes.Status503ServiceUnavailable, DatabaseBusy, true);
                }
            }
            if (ex.Message.Contains("timeout", StringComparison.OrdinalIgnoreCase)
                || ex.Message.Contains("connection", StringComparison.OrdinalIgnoreCase))
                return (StatusCodes.Status503ServiceUnavailable, DatabaseUnavailable, true);

            var mapped = MapSqlException(ex);
            return mapped == null
                ? (StatusCodes.Status500InternalServerError, Unexpected, true)
                : (StatusCodes.Status400BadRequest, mapped, true); // logged: the detail helps support
        }

        private static string? MapSqlException(SqlException ex)
        {
            foreach (SqlError err in ex.Errors)
            {
                switch (err.Number)
                {
                    case 2627:
                    case 2601:
                        if (err.Message.Contains("UQ_CVR_Contracts_Ref", StringComparison.OrdinalIgnoreCase)
                            || err.Message.Contains("ContractReference", StringComparison.OrdinalIgnoreCase))
                        {
                            return "Contract reference must be unique.";
                        }
                        if (err.Message.Contains("CVR_SettlementPaymentPeriods", StringComparison.OrdinalIgnoreCase)
                            || err.Message.Contains("SPP_", StringComparison.OrdinalIgnoreCase))
                        {
                            return "One of these periods has already been settled. Refresh the page to see the latest settlements.";
                        }
                        return "A record with the same unique value already exists.";
                    case 547:
                        if (err.Message.Contains("STK04_Employee", StringComparison.OrdinalIgnoreCase))
                        {
                            return "Your user isn't set up as an employee in POS, so the credit note can't be recorded. Nothing was saved.";
                        }
                        if (err.Message.Contains("CVR_ComputationType", StringComparison.OrdinalIgnoreCase)
                            || err.Message.Contains("TAR_ComputationTypeID", StringComparison.OrdinalIgnoreCase))
                        {
                            return "This computation type is in use by targets and cannot be deleted.";
                        }
                        if (err.Message.Contains("CVR_Types", StringComparison.OrdinalIgnoreCase)
                            || err.Message.Contains("PLN_TypeID", StringComparison.OrdinalIgnoreCase))
                        {
                            return "This volume rebate type is used by a contract and cannot be deleted.";
                        }
                        if (err.Message.Contains("_Suppliers", StringComparison.OrdinalIgnoreCase)
                            || err.Message.Contains("SupCode", StringComparison.OrdinalIgnoreCase))
                        {
                            return "Invalid supplier selected.";
                        }
                        if (err.Message.Contains("FK_CVR_Targets_SettlementTypes", StringComparison.OrdinalIgnoreCase)
                            || err.Message.Contains("FK_CVR_Fees_SettlementTypes", StringComparison.OrdinalIgnoreCase))
                        {
                            return "This settlement type is in use by targets or fees and cannot be deleted.";
                        }
                        if (err.Message.Contains("Com_Currency", StringComparison.OrdinalIgnoreCase)
                            || err.Message.Contains("Currency", StringComparison.OrdinalIgnoreCase))
                        {
                            return "Invalid currency code.";
                        }
                        return "Invalid reference to a related record.";
                    case 515:
                        return "A required value is missing, so nothing was saved.";
                    case 8152:
                        return "One or more values exceed the maximum allowed length.";
                }
            }

            return null;
        }
    }

    /// <summary>
    /// The legacy POS credit note routine reports its checks in short technical sentences;
    /// these say what happened and what to do.
    /// </summary>
    public static class PosMessages
    {
        public static string Explain(string message)
        {
            if (message.StartsWith("Day Is Closed", StringComparison.OrdinalIgnoreCase))
                return "The POS business day is closed, so the credit note can't be created. Open today's day in the POS back office and try again. Nothing was saved.";
            if (message.StartsWith("Invalid Or Non-BO Location", StringComparison.OrdinalIgnoreCase))
                return $"The POS location set for settlements ({After(message)}) doesn't exist or isn't a back-office location. Check the Location setting of the API. Nothing was saved.";
            if (message.StartsWith("Invalid Or Inactive Cash Register", StringComparison.OrdinalIgnoreCase))
                return $"The cash register set for settlements ({After(message)}) doesn't exist or is inactive in POS. Check the CashReg setting of the API. Nothing was saved.";
            if (message.StartsWith("Credit Note Document Type (CV) Not Defined", StringComparison.OrdinalIgnoreCase))
                return "Credit notes (document type CV) aren't set up for this POS location. Set them up in POS and try again. Nothing was saved.";
            if (message.StartsWith("Credit Note Prefix Not Defined", StringComparison.OrdinalIgnoreCase))
                return "The credit note prefix set for settlements isn't defined for this POS location. Check the Prefix setting of the API. Nothing was saved.";
            return message;
        }

        private static string After(string message)
        {
            var i = message.IndexOf(':');
            return i >= 0 ? message[(i + 1)..].Trim() : "";
        }
    }
}
