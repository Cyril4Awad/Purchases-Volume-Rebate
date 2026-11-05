-- 09. CVR_TargetConditions  (run in numbered order: foreign keys depend on earlier tables)
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[CVR_TargetConditions](
    [TCD_TargetConditionID]  [numeric](18, 0) IDENTITY(1,1) NOT NULL,
    [TCD_TargetID]           [numeric](18, 0) NOT NULL,
    [TCD_ConditionType]      [nvarchar](1)    NULL,
    [TCD_Operator]           [nvarchar](2)    NULL,
    [TCD_Value]              [numeric](18, 3) NULL,
    [TCD_LogicalGroup]       [numeric](18, 0) NULL,
    [TCD_LogicalOperator]    [nvarchar](3)    NULL,
    [TCD_SalesAmountCurrency][varchar](3)     NULL,
    [TCD_RebateType]         [varchar](1)     NULL,
    [TCD_RebateCurrency]     [varchar](3)     NULL,
    [TCD_RebateAmount]       [numeric](18, 3) NULL,
    [TCD_CDStamp]            [datetime]       NOT NULL,
    [TCD_CUStamp]            [nvarchar](4)    NULL,
    [TCD_MDStamp]            [datetime]       NULL,
    [TCD_MUStamp]            [nvarchar](4)    NULL,
    CONSTRAINT [PK_CVR_TargetConditions] PRIMARY KEY CLUSTERED ([TCD_TargetConditionID] ASC)
) ON [PRIMARY]
GO
ALTER TABLE [dbo].[CVR_TargetConditions] ADD DEFAULT (getdate()) FOR [TCD_CDStamp];
GO
ALTER TABLE CVR_TargetConditions WITH CHECK
    ADD CONSTRAINT FK_CVR_TargetConditions_Targets
    FOREIGN KEY (TCD_TargetID) REFERENCES CVR_Targets (TAR_TargetID);
GO
