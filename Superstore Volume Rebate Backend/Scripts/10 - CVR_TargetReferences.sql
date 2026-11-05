-- 10. CVR_TargetReferences  (run in numbered order: foreign keys depend on earlier tables)
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[CVR_TargetReferences](
    [TRF_TargetScopeReferenceID] [numeric](18, 0) IDENTITY(1,1) NOT NULL,
    [TRF_TargetID]               [numeric](18, 0) NOT NULL,
    [TRF_ScopeType]              [nvarchar](1)    NULL,
    [TRF_StockItemID]            [numeric](18, 0) NULL,
    [TRF_ProductGroupID]         [numeric](18, 0) NULL,
    [TRF_CDStamp]                [datetime]       NOT NULL,
    [TRF_CUStamp]                [nvarchar](4)    NULL,
    [TRF_MDStamp]                [datetime]       NULL,
    [TRF_MUStamp]                [nvarchar](4)    NULL,
    CONSTRAINT [PK_CVR_TargetReferences] PRIMARY KEY CLUSTERED ([TRF_TargetScopeReferenceID] ASC)
) ON [PRIMARY]
GO
ALTER TABLE [dbo].[CVR_TargetReferences] ADD DEFAULT (getdate()) FOR [TRF_CDStamp];
GO
ALTER TABLE CVR_TargetReferences WITH CHECK
    ADD CONSTRAINT FK_CVR_TargetReferences_Targets
    FOREIGN KEY (TRF_TargetID) REFERENCES CVR_Targets (TAR_TargetID);
GO
