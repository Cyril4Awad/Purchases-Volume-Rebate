-- 02. CVR_ComputationType  (run in numbered order: foreign keys depend on earlier tables)
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[CVR_ComputationType](
    [FRT_ComputationTypeID]   [numeric](18, 0) IDENTITY(1,1) NOT NULL,
    [FRT_ComputationTypeName] [nvarchar](100)  NOT NULL,
    [FRT_PeriodLength]        [numeric](18, 0) NULL,
    [FRT_IsCustom]            [bit]            NOT NULL,
    [FRT_Remarks]             [nvarchar](500)  NULL,
    [FRT_Active]              [bit]            NOT NULL,
    [FRT_CDStamp]             [datetime]       NOT NULL,
    [FRT_CUStamp]             [nvarchar](4)    NULL,
    [FRT_MDStamp]             [datetime]       NULL,
    [FRT_MUStamp]             [nvarchar](4)    NULL,
    CONSTRAINT [PK_CVR_ComputationType] PRIMARY KEY CLUSTERED ([FRT_ComputationTypeID] ASC)
) ON [PRIMARY]
GO
ALTER TABLE CVR_ComputationType
ADD CONSTRAINT UQ_ComputationType_Name UNIQUE (FRT_ComputationTypeName);
ALTER TABLE [dbo].[CVR_ComputationType] ADD DEFAULT ((0))       FOR [FRT_IsCustom];
ALTER TABLE [dbo].[CVR_ComputationType] ADD DEFAULT ((1))       FOR [FRT_Active];
ALTER TABLE [dbo].[CVR_ComputationType] ADD DEFAULT (getdate()) FOR [FRT_CDStamp];
GO
