-- 01. CVR_Types  (run in numbered order: foreign keys depend on earlier tables)
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[CVR_Types](
    [VRT_TypeID]    [numeric](18, 0) IDENTITY(1,1) NOT NULL,
    [VRT_TypeName]  [nvarchar](100)  NOT NULL,
    [VRT_Behavior]  [nvarchar](1)    NULL,
    [VRT_Remarks]   [nvarchar](500)  NULL,
    [VRT_Active]    [bit]            NOT NULL,
    [VRT_CDStamp]   [datetime]       NOT NULL,
    [VRT_CUStamp]   [nvarchar](4)    NULL,
    [VRT_MDStamp]   [datetime]       NULL,
    [VRT_MUStamp]   [nvarchar](4)    NULL,
    CONSTRAINT [PK_CVR_Types] PRIMARY KEY CLUSTERED ([VRT_TypeID] ASC)
) ON [PRIMARY]
GO
ALTER TABLE CVR_Types
ADD CONSTRAINT UQ_Types_Name UNIQUE (VRT_TypeName);
ALTER TABLE [dbo].[CVR_Types] ADD DEFAULT ((1))       FOR [VRT_Active];
ALTER TABLE [dbo].[CVR_Types] ADD DEFAULT (getdate()) FOR [VRT_CDStamp];
GO
