using DataService.Models.DTOs;

public class CVRComputationEngine
{
    private readonly CVRComputationDAL _dal;

    public CVRComputationEngine(CVRComputationDAL dal) => _dal = dal;

    public Task<CVR_TargetSalesDto?> GetTargetSalesAsync(List<string> supCodes, int targetId) =>
        _dal.GetTargetSalesAsync(supCodes, targetId);

    public Task<Dictionary<int, CVR_TargetSalesDto>> GetTargetSalesBatchAsync(
        List<string> supCodes, List<int> targetIds) =>
        _dal.GetTargetSalesBatchAsync(supCodes, targetIds);

    public Task<CVR_TargetItemsResponseDto?> GetTargetItemsAsync(List<string> supCodes, int targetId) =>
        _dal.GetTargetItemsAsync(supCodes, targetId);

    public Task<CVR_TotalSalesDto> GetTotalClientSalesAsync(
    List<string> supCodes, DateTime fromDate, DateTime toDate) =>
    _dal.GetTotalClientSalesAsync(supCodes, fromDate, toDate);

    public Task<Dictionary<string, CVR_TargetSalesDto>> GetTargetSalesPreviewBatchAsync(
        List<string> supCodes, List<CVR_SalesBatchPreviewTarget> targets) =>
        _dal.GetTargetSalesPreviewBatchAsync(supCodes, targets);

    public Task<CVR_BreakdownResponseDto> GetPurchaseBreakdownAsync(
        List<string> supCodes, DateTime fromDate, DateTime toDate, List<long>? stockIds, List<int>? categoryIds) =>
        _dal.GetPurchaseBreakdownAsync(supCodes, fromDate, toDate, stockIds, categoryIds);
}
