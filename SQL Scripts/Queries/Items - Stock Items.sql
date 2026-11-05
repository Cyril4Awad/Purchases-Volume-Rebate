DECLARE @Loc    varchar(2)    = '01';
DECLARE @Search nvarchar(100) = NULL;
DECLARE @Skip   int           = 0;
DECLARE @Take   int           = 25;

DECLARE @Like nvarchar(110) =
    CASE
        WHEN NULLIF(LTRIM(RTRIM(@Search)), '') IS NULL THEN NULL
        ELSE '%' + REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(@Search)), '[', '[[]'), '%', '[%]'), '_', '[_]') + '%'
    END;

SELECT COUNT(*) AS TotalCount
FROM dbo.tbl_StockItm s
WHERE s.Stk_Loc    = @Loc
  AND s.Stk_Status = 'A'
  AND (
          @Like IS NULL
          OR (s.Stk_Supplier + '/' + s.Stk_Category + '/' + s.Stk_Serial) LIKE @Like
          OR s.Stk_Desc     LIKE @Like
          OR s.Stk_Barcode1 LIKE @Like
          OR s.Stk_Barcode2 LIKE @Like
      );

SELECT
    CAST(s.Stk_StkId AS int)                                   AS StkId,
    s.Stk_Supplier + '/' + s.Stk_Category + '/' + s.Stk_Serial AS ItemReference,
    s.Stk_Desc                                                 AS Description,
    ISNULL(s.Stk_Barcode1, '')                                 AS Barcode,
    ISNULL(s.Stk_UnitCode, '')                                 AS Unit,
    s.Stk_Category                                             AS CategoryCode
FROM dbo.tbl_StockItm s
WHERE s.Stk_Loc    = @Loc
  AND s.Stk_Status = 'A'
  AND (
          @Like IS NULL
          OR (s.Stk_Supplier + '/' + s.Stk_Category + '/' + s.Stk_Serial) LIKE @Like
          OR s.Stk_Desc     LIKE @Like
          OR s.Stk_Barcode1 LIKE @Like
          OR s.Stk_Barcode2 LIKE @Like
      )
ORDER BY
    s.Stk_Supplier,
    s.Stk_Category,
    s.Stk_Serial,
    s.Stk_StkId
OFFSET @Skip ROWS FETCH NEXT @Take ROWS ONLY;
