-- 12. CVR_Computations  (run in numbered order: foreign keys depend on earlier tables)
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[CVR_Computations](
    [CMP_ComputationID]           [numeric](18, 0) IDENTITY(1,1) NOT NULL,
    [CMP_ContractID]              [numeric](18, 0) NOT NULL,
    [CMP_TargetID]                [numeric](18, 0) NULL,
    [CMP_FeeID]                   [numeric](18, 0) NULL,
    [CMP_DateFrom]                [date]           NULL,
    [CMP_DateTo]                  [date]           NULL,
    [CMP_SalesAmount]             [numeric](18, 3) NULL,
    [CMP_SalesQty]                [numeric](18, 3) NULL,
    [CMP_PreviousYearSalesAmount] [numeric](18, 3) NULL,
    [CMP_Growth]                  [numeric](18, 2) NULL,
    [CMP_RebateAmount]            [numeric](18, 3) NOT NULL,
    [CMP_Currency]                [varchar](3)     NOT NULL,
    [CMP_CDStamp]                 [datetime]       NOT NULL,
    [CMP_CUStamp]                 [nvarchar](4)    NULL,
    [CMP_MDStamp]                 [datetime]       NULL,
    [CMP_MUStamp]                 [nvarchar](4)    NULL,
    CONSTRAINT [PK_CVR_Computations] PRIMARY KEY CLUSTERED ([CMP_ComputationID] ASC),
    CONSTRAINT [CHK_CVR_Computations_TargetOrFee]
        CHECK (
            ([CMP_TargetID] IS NOT NULL AND [CMP_FeeID] IS NULL)
            OR
            ([CMP_FeeID] IS NOT NULL AND [CMP_TargetID] IS NULL)
        )
) ON [PRIMARY]
GO
ALTER TABLE [dbo].[CVR_Computations] ADD DEFAULT (getdate()) FOR [CMP_CDStamp];
GO
ALTER TABLE [dbo].[CVR_Computations] WITH CHECK
    ADD CONSTRAINT [FK_CVR_Computations_Contracts] FOREIGN KEY([CMP_ContractID])
    REFERENCES [dbo].[CVR_Contracts] ([CTR_ContractID]);
ALTER TABLE [dbo].[CVR_Computations] CHECK CONSTRAINT [FK_CVR_Computations_Contracts];
GO
ALTER TABLE [dbo].[CVR_Computations] WITH CHECK
    ADD CONSTRAINT [FK_CVR_Computations_Targets] FOREIGN KEY([CMP_TargetID])
    REFERENCES [dbo].[CVR_Targets] ([TAR_TargetID]);
ALTER TABLE [dbo].[CVR_Computations] CHECK CONSTRAINT [FK_CVR_Computations_Targets];
GO
ALTER TABLE [dbo].[CVR_Computations] WITH CHECK
    ADD CONSTRAINT [FK_CVR_Computations_Fees] FOREIGN KEY([CMP_FeeID])
    REFERENCES [dbo].[CVR_Fees] ([FEE_FeeID]);
ALTER TABLE [dbo].[CVR_Computations] CHECK CONSTRAINT [FK_CVR_Computations_Fees];
GO

CREATE UNIQUE INDEX [UX_CVR_Computations_Target]
    ON [dbo].[CVR_Computations]([CMP_TargetID])
    WHERE [CMP_TargetID] IS NOT NULL;
GO
CREATE UNIQUE INDEX [UX_CVR_Computations_Fee]
    ON [dbo].[CVR_Computations]([CMP_FeeID])
    WHERE [CMP_FeeID] IS NOT NULL;
GO
