-- 06. CVR_Plans  (run in numbered order: foreign keys depend on earlier tables)
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[CVR_Plans](
    [PLN_PlanID]       [numeric](18, 0) IDENTITY(1,1) NOT NULL,
    [PLN_ContractID]   [numeric](18, 0) NOT NULL,
    [PLN_TypeID]       [numeric](18, 0) NOT NULL,
    [PLN_PlanName]     [nvarchar](100)  NOT NULL,
    [PLN_Remarks]      [nvarchar](500)  NULL,
    [PLN_Active]       [bit]            NOT NULL,
    [PLN_CDStamp]      [datetime]       NOT NULL,
    [PLN_CUStamp]      [nvarchar](4)    NULL,
    [PLN_MDStamp]      [datetime]       NULL,
    [PLN_MUStamp]      [nvarchar](4)    NULL,
    CONSTRAINT [PK_CVR_Plans] PRIMARY KEY CLUSTERED ([PLN_PlanID] ASC)
) ON [PRIMARY]
GO
ALTER TABLE [dbo].[CVR_Plans] ADD DEFAULT ((1))       FOR [PLN_Active];
ALTER TABLE [dbo].[CVR_Plans] ADD DEFAULT (getdate()) FOR [PLN_CDStamp];
GO
ALTER TABLE [dbo].[CVR_Plans] WITH CHECK
    ADD CONSTRAINT [FK_CVR_Plans_Contracts] FOREIGN KEY([PLN_ContractID])
    REFERENCES [dbo].[CVR_Contracts] ([CTR_ContractID]);
ALTER TABLE [dbo].[CVR_Plans] CHECK CONSTRAINT [FK_CVR_Plans_Contracts];
GO
ALTER TABLE [dbo].[CVR_Plans] WITH CHECK
    ADD CONSTRAINT [FK_CVR_Plans_Types] FOREIGN KEY([PLN_TypeID])
    REFERENCES [dbo].[CVR_Types] ([VRT_TypeID]);
ALTER TABLE [dbo].[CVR_Plans] CHECK CONSTRAINT [FK_CVR_Plans_Types];
GO
