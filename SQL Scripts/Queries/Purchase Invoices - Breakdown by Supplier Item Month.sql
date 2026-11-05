SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;

DECLARE @Loc      varchar(2) = '01';
DECLARE @FromDate date       = '2026-01-01';
DECLARE @ToDate   date       = '2027-01-01';

DECLARE @SupplierCodes TABLE (SupCode varchar(4) PRIMARY KEY);
INSERT INTO @SupplierCodes (SupCode) VALUES ('0002'), ('0003');

SELECT
    h.Pih_Supp                                                      AS SupplierCode,
    ISNULL(MAX(sup.Sup_Name), '')                                   AS SupplierName,
    CAST(d.Pid_StkId AS int)                                        AS StkId,
    MAX(s.Stk_Supplier + '/' + s.Stk_Category + '/' + s.Stk_Serial) AS ItemReference,
    ISNULL(MAX(s.Stk_Desc), '')                                     AS ItemDesc,
    ISNULL(MAX(s.Stk_UnitCode), '')                                 AS Unit,
    ISNULL(MAX(s.Stk_Category), '')                                 AS CategoryCode,
    ISNULL(MAX(c.Cat_Desc), '')                                     AS CategoryDesc,
    CONVERT(char(7), h.Pih_PIdate, 126)                             AS MonthKey,
    SUM(CASE WHEN h.Pih_Type = 'N' THEN ISNULL(d.Pid_PurQty, 0) ELSE -ISNULL(d.Pid_PurQty, 0) END) AS Qty,
    SUM(CASE WHEN h.Pih_Type = 'N' THEN amounts.AmtUSD ELSE -amounts.AmtUSD END)                    AS AmountUSD,
    SUM(CASE WHEN h.Pih_Type = 'N' THEN amounts.AmtLBP ELSE -amounts.AmtLBP END)                    AS AmountLBP
FROM dbo.tbl_PurInvHeader h
INNER JOIN dbo.tbl_PurInvDetails d
    ON  d.Pid_Loc       = h.Pih_Loc
    AND d.Pid_Reference = h.Pih_Reference
    AND d.Pid_Type      = h.Pih_Type
CROSS APPLY (
    SELECT
        CASE
            WHEN d.Pid_Entry IN ('P', 'R') THEN 0
            ELSE ISNULL(d.Pid_PurQty, 0) * ISNULL(d.Pid_UCost, 0)
                 * (1 - ISNULL(d.Pid_UDisc, 0) / 100.0)
                 * (1 - ISNULL(h.Pih_AddDisc, 0) / 100.0)
               + CASE
                     WHEN d.Pid_Entry IN ('N', 'C')
                         THEN ISNULL(d.Pid_VatAmt, 0) * (1 - ISNULL(h.Pih_AddDisc, 0) / 100.0)
                     ELSE 0
                 END
        END AS NetCur
) line
OUTER APPLY (
    SELECT TOP (1)
        dr.DR_Rate1LC AS Rate,
        dr.DR_Op1LC   AS Op
    FROM dbo.Com_DailyRate dr
    WHERE h.Pih_Curr NOT IN ('$', 'LL')
      AND dr.DR_CurCode = h.Pih_Curr
      AND dr.DR_Date   <= h.Pih_PIdate
    ORDER BY dr.DR_Date DESC
) fx
CROSS APPLY (
    SELECT
        CASE
            WHEN h.Pih_Curr = 'LL' THEN line.NetCur
            WHEN h.Pih_Curr = '$'  THEN line.NetCur * ISNULL(h.Pih_RateCC, 0)
            WHEN fx.Op = '/'       THEN line.NetCur / NULLIF(fx.Rate, 0)
            ELSE line.NetCur * ISNULL(fx.Rate, 0)
        END AS AmtLBP
) lbp
CROSS APPLY (
    SELECT
        CAST(CASE
                 WHEN h.Pih_Curr = '$' THEN line.NetCur
                 ELSE ISNULL(lbp.AmtLBP / NULLIF(h.Pih_RateCC, 0), 0)
             END AS decimal(18, 3))                   AS AmtUSD,
        CAST(ISNULL(lbp.AmtLBP, 0) AS decimal(18, 3)) AS AmtLBP
) amounts
INNER JOIN dbo.tbl_StockItm s
    ON  s.Stk_Loc   = d.Pid_Loc
    AND s.Stk_StkId = d.Pid_StkId
LEFT JOIN dbo.tbl_Suppliers sup
    ON  sup.Sup_Loc  = h.Pih_Loc
    AND sup.Sup_Code = h.Pih_Supp
LEFT JOIN dbo.tbl_Categories c
    ON  c.Cat_Loc  = s.Stk_Loc
    AND c.Cat_Code = s.Stk_Category
WHERE h.Pih_Loc = @Loc
  AND h.Pih_Type IN ('N', 'R')
  AND h.Pih_StkUpdate IS NOT NULL
  AND NOT EXISTS (
          SELECT 1
          FROM dbo.tbl_PurInvHeader rv
          WHERE rv.Pih_Loc       = h.Pih_Loc
            AND rv.Pih_Reference = h.Pih_Reference
            AND rv.Pih_Type      = 'X'
            AND rv.Pih_StkUpdate IS NOT NULL
      )
  AND h.Pih_Supp IN (SELECT SupCode FROM @SupplierCodes)
  AND CAST(h.Pih_PIdate AS date) >= @FromDate
  AND CAST(h.Pih_PIdate AS date) <  @ToDate
GROUP BY
    h.Pih_Supp,
    d.Pid_StkId,
    CONVERT(char(7), h.Pih_PIdate, 126)
ORDER BY
    SupplierCode,
    MonthKey,
    ItemReference;
