-- 03. CVR_SettlementTypes  (run in numbered order: foreign keys depend on earlier tables)
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[CVR_SettlementTypes](
    [STT_SettlementTypeID]   [numeric](18, 0) IDENTITY(1,1) NOT NULL,
    [STT_SettlementTypeName] [nvarchar](100)  NOT NULL,
    [STT_PeriodLength]       [numeric](18, 0) NULL,
    [STT_IsCustom]           [bit]            NOT NULL,
    [STT_Remarks]            [nvarchar](500)  NULL,
    [STT_Active]             [bit]            NOT NULL,
    [STT_CDStamp]            [datetime]       NOT NULL,
    [STT_CUStamp]            [nvarchar](4)    NULL,
    [STT_MDStamp]            [datetime]       NULL,
    [STT_MUStamp]            [nvarchar](4)    NULL,
    CONSTRAINT [PK_CVR_SettlementTypes] PRIMARY KEY CLUSTERED ([STT_SettlementTypeID] ASC)
) ON [PRIMARY]
GO
ALTER TABLE CVR_SettlementTypes
ADD CONSTRAINT UQ_SettlementType_Name UNIQUE (STT_SettlementTypeName);
ALTER TABLE [dbo].[CVR_SettlementTypes] ADD DEFAULT ((0))       FOR [STT_IsCustom];
ALTER TABLE [dbo].[CVR_SettlementTypes] ADD DEFAULT ((1))       FOR [STT_Active];
ALTER TABLE [dbo].[CVR_SettlementTypes] ADD DEFAULT (getdate()) FOR [STT_CDStamp];
GO
