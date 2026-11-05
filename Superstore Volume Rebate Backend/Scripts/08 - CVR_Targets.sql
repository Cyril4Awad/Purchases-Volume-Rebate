-- 08. CVR_Targets  (run in numbered order: foreign keys depend on earlier tables)
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[CVR_Targets](
    [TAR_TargetID]          [numeric](18, 0) IDENTITY(1,1) NOT NULL,
    [TAR_PlanID]            [numeric](18, 0) NOT NULL,
    [TAR_TargetName]        [nvarchar](100)  NULL,
    [TAR_FromDate]          [date]           NULL,
    [TAR_ToDate]            [date]           NULL,
    [TAR_RebateValueType]   [varchar](1)     NULL,
    [TAR_RebateValue]       [numeric](18, 3) NULL,
    [TAR_Currency]          [varchar](3)     NULL,
    [TAR_SettlementTypeID]  [numeric](18, 0) NULL,
    [TAR_ComputationTypeID] [numeric](18, 0) NULL,
    [TAR_TargetType]        [varchar](1)     NULL,
    [TAR_Override]          [bit]            NOT NULL,
    [TAR_CDStamp]           [datetime]       NOT NULL,
    [TAR_CUStamp]           [nvarchar](4)    NULL,
    [TAR_MDStamp]           [datetime]       NULL,
    [TAR_MUStamp]           [nvarchar](4)    NULL,
    CONSTRAINT [PK_CVR_Targets] PRIMARY KEY CLUSTERED ([TAR_TargetID] ASC)
) ON [PRIMARY]
GO
ALTER TABLE [dbo].[CVR_Targets] ADD CONSTRAINT [DF_CVR_Targets_RebateValueType] DEFAULT ('F') FOR [TAR_RebateValueType];
ALTER TABLE [dbo].[CVR_Targets] ADD DEFAULT (getdate()) FOR [TAR_CDStamp];
ALTER TABLE [dbo].[CVR_Targets] ADD DEFAULT ((0))       FOR [TAR_Override];
GO
ALTER TABLE [dbo].[CVR_Targets] WITH CHECK
    ADD CONSTRAINT [FK_CVR_Targets_ComputationTypes] FOREIGN KEY([TAR_ComputationTypeID])
    REFERENCES [dbo].[CVR_ComputationType] ([FRT_ComputationTypeID]);
ALTER TABLE [dbo].[CVR_Targets] CHECK CONSTRAINT [FK_CVR_Targets_ComputationTypes];
GO
ALTER TABLE [dbo].[CVR_Targets] WITH CHECK
    ADD CONSTRAINT [FK_CVR_Targets_Plans] FOREIGN KEY([TAR_PlanID])
    REFERENCES [dbo].[CVR_Plans] ([PLN_PlanID]);
ALTER TABLE [dbo].[CVR_Targets] CHECK CONSTRAINT [FK_CVR_Targets_Plans];
GO
ALTER TABLE [dbo].[CVR_Targets] WITH CHECK
    ADD CONSTRAINT [FK_CVR_Targets_SettlementTypes] FOREIGN KEY([TAR_SettlementTypeID])
    REFERENCES [dbo].[CVR_SettlementTypes] ([STT_SettlementTypeID]);
ALTER TABLE [dbo].[CVR_Targets] CHECK CONSTRAINT [FK_CVR_Targets_SettlementTypes];
GO
