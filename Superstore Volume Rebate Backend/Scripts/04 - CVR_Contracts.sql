-- 04. CVR_Contracts  (run in numbered order: foreign keys depend on earlier tables)
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[CVR_Contracts](
	[CTR_ContractID] [numeric](18, 0) IDENTITY(1,1) NOT NULL,
	[CTR_SupCode] [varchar](4) NOT NULL,
	[CTR_SupLoc] [varchar](2) NOT NULL,
	[CTR_ContractReference] [nvarchar](50) NOT NULL,
	[CTR_ContractName] [nvarchar](100) NULL,
	[CTR_ContractCurrency] [varchar](3) NULL,
	[CTR_StartDate] [date] NULL,
	[CTR_EndDate] [date] NULL,
	[CTR_Terms] [nvarchar](max) NULL,
	[CTR_Document] [varbinary](max) NULL,
	[CTR_DocumentName] [nvarchar](500) NULL,
	[CTR_Remarks] [nvarchar](500) NULL,
	[CTR_Active] [bit] NOT NULL,
	[CTR_CDStamp] [datetime] NOT NULL,
	[CTR_CUStamp] [nvarchar](4) NULL,
	[CTR_MDStamp] [datetime] NULL,
	[CTR_MUStamp] [nvarchar](4) NULL,
 CONSTRAINT [PK_CVR_Contracts] PRIMARY KEY CLUSTERED 
(
	[CTR_ContractID] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON) ON [PRIMARY],
 CONSTRAINT [UQ_CVR_Contracts_Ref] UNIQUE NONCLUSTERED 
(
	[CTR_ContractReference] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
ALTER TABLE [dbo].[CVR_Contracts] ADD  DEFAULT ((1)) FOR [CTR_Active]
GO
ALTER TABLE [dbo].[CVR_Contracts] ADD  DEFAULT (getdate()) FOR [CTR_CDStamp]
GO
ALTER TABLE [dbo].[CVR_Contracts] WITH CHECK
    ADD CONSTRAINT [FK_CVR_Contracts_Suppliers] FOREIGN KEY([CTR_SupCode], [CTR_SupLoc])
    REFERENCES [dbo].[tbl_Suppliers] ([Sup_Code], [Sup_Loc]);
ALTER TABLE [dbo].[CVR_Contracts] CHECK CONSTRAINT [FK_CVR_Contracts_Suppliers];
GO
