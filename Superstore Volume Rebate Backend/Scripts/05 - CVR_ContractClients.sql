-- 05. CVR_ContractClients  (run in numbered order: foreign keys depend on earlier tables)
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[CVR_ContractClients](
    [CTC_ContractClientID] [numeric](18, 0) IDENTITY(1,1) NOT NULL,
    [CTC_ContractID]       [numeric](18, 0) NOT NULL,
    [CTC_SupCode]          [varchar](4)     NOT NULL,
    [CTC_SupLoc]           [varchar](2)     NOT NULL,
    [CTC_CDStamp]          [datetime]       NOT NULL,
    [CTC_CUStamp]          [nvarchar](4)    NULL,
    [CTC_MDStamp]          [datetime]       NULL,
    [CTC_MUStamp]          [nvarchar](4)    NULL,
    CONSTRAINT [PK_CVR_ContractClients] PRIMARY KEY CLUSTERED ([CTC_ContractClientID] ASC)
) ON [PRIMARY]
GO
ALTER TABLE [dbo].[CVR_ContractClients] ADD DEFAULT (getdate()) FOR [CTC_CDStamp];
GO
ALTER TABLE [dbo].[CVR_ContractClients] WITH CHECK
    ADD CONSTRAINT [FK_CVR_ContractClients_Contract] FOREIGN KEY([CTC_ContractID])
    REFERENCES [dbo].[CVR_Contracts] ([CTR_ContractID]);
ALTER TABLE [dbo].[CVR_ContractClients] CHECK CONSTRAINT [FK_CVR_ContractClients_Contract];
GO
ALTER TABLE [dbo].[CVR_ContractClients] WITH CHECK
    ADD CONSTRAINT [FK_CVR_ContractClients_Suppliers] FOREIGN KEY([CTC_SupCode], [CTC_SupLoc])
    REFERENCES [dbo].[tbl_Suppliers] ([Sup_Code], [Sup_Loc]);
ALTER TABLE [dbo].[CVR_ContractClients] CHECK CONSTRAINT [FK_CVR_ContractClients_Suppliers];
GO
