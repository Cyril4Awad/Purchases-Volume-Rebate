-- 07. CVR_Fees  (run in numbered order: foreign keys depend on earlier tables)
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[CVR_Fees](
    [FEE_FeeID]         [numeric](18, 0) IDENTITY(1,1) NOT NULL,
    [FEE_PlanID]        [numeric](18, 0) NOT NULL,
    [FEE_Name]          [nvarchar](100)  NOT NULL,
    [FEE_Currency]      [varchar](3)     NULL,
    [FEE_Amount]        [numeric](18, 3) NULL,
    [FEE_SettlementType][numeric](18, 0) NULL,
    [FEE_CDStamp]       [datetime]       NOT NULL,
    [FEE_CUStamp]       [nvarchar](4)    NULL,
    [FEE_MDStamp]       [datetime]       NULL,
    [FEE_MUStamp]       [nvarchar](4)    NULL,
    CONSTRAINT [PK_CVR_Fees] PRIMARY KEY CLUSTERED ([FEE_FeeID] ASC)
) ON [PRIMARY]
GO
ALTER TABLE [dbo].[CVR_Fees] ADD DEFAULT (getdate()) FOR [FEE_CDStamp];
GO
ALTER TABLE [dbo].[CVR_Fees] WITH CHECK
    ADD CONSTRAINT [FK_CVR_Fees_Plans] FOREIGN KEY([FEE_PlanID])
    REFERENCES [dbo].[CVR_Plans] ([PLN_PlanID]);
ALTER TABLE [dbo].[CVR_Fees] CHECK CONSTRAINT [FK_CVR_Fees_Plans];
GO
ALTER TABLE [dbo].[CVR_Fees] WITH CHECK
    ADD CONSTRAINT [FK_CVR_Fees_SettlementTypes] FOREIGN KEY([FEE_SettlementType])
    REFERENCES [dbo].[CVR_SettlementTypes] ([STT_SettlementTypeID]);
ALTER TABLE [dbo].[CVR_Fees] CHECK CONSTRAINT [FK_CVR_Fees_SettlementTypes];
GO
