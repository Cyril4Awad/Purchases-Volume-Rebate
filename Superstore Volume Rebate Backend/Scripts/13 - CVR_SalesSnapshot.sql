-- 13. CVR_SalesSnapshot  (run in numbered order: foreign keys depend on earlier tables)
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[CVR_SalesSnapshot](
    [SSN_SalesSnapshotID]         [numeric](18, 0) IDENTITY(1,1) NOT NULL,
    [SSN_ComputationID]           [numeric](18, 0) NOT NULL,
    [SSN_SupCode]                 [varchar](4)     NOT NULL,
    [SSN_SupLoc]                  [varchar](2)     NOT NULL,
    [SSN_SalesAmount]             [numeric](18, 3) NULL,
    [SSN_SalesQty]                [numeric](18, 3) NULL,
    [SSN_PreviousYearSalesAmount] [numeric](18, 3) NULL,
    [SSN_Growth]                  [numeric](18, 2) NULL,
    [SSN_Currency]                [varchar](3)     NULL,
    [SSN_CDStamp]                 [datetime]       NOT NULL,
    [SSN_CUStamp]                 [nvarchar](4)    NULL,
    [SSN_MDStamp]                 [datetime]       NULL,
    [SSN_MUStamp]                 [nvarchar](4)    NULL,
    CONSTRAINT [PK_CVR_SalesSnapshot] PRIMARY KEY CLUSTERED ([SSN_SalesSnapshotID] ASC)
) ON [PRIMARY]
GO
ALTER TABLE [dbo].[CVR_SalesSnapshot] ADD DEFAULT (getdate()) FOR [SSN_CDStamp];
GO
ALTER TABLE [dbo].[CVR_SalesSnapshot] WITH CHECK
    ADD CONSTRAINT [FK_CVR_SalesSnapshot_Computations] FOREIGN KEY([SSN_ComputationID])
    REFERENCES [dbo].[CVR_Computations] ([CMP_ComputationID]);
ALTER TABLE [dbo].[CVR_SalesSnapshot] CHECK CONSTRAINT [FK_CVR_SalesSnapshot_Computations];
GO
ALTER TABLE [dbo].[CVR_SalesSnapshot] WITH CHECK
    ADD CONSTRAINT [FK_CVR_SalesSnapshot_Suppliers] FOREIGN KEY([SSN_SupCode], [SSN_SupLoc])
    REFERENCES [dbo].[tbl_Suppliers] ([Sup_Code], [Sup_Loc]);
ALTER TABLE [dbo].[CVR_SalesSnapshot] CHECK CONSTRAINT [FK_CVR_SalesSnapshot_Suppliers];
GO
