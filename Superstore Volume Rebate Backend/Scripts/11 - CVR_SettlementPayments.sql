-- 11. CVR_SettlementPayments  (run in numbered order: foreign keys depend on earlier tables)
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[CVR_SettlementPayments](
	[STP_SettlementPaymentID] [numeric](18, 0) IDENTITY(1,1) NOT NULL,
	[STP_ContractID] [numeric](18, 0) NOT NULL,
	[STP_ResultType] [varchar](1) NOT NULL,
	[STP_TargetID] [numeric](18, 0) NULL,
	[STP_FeeID] [numeric](18, 0) NULL,
	[STP_AmountProcessed] [numeric](18, 3) NOT NULL,
	[STP_AmountLeft] [numeric](18, 3) NOT NULL,
	[STP_TotalAmountAtProcess] [numeric](18, 3) NOT NULL,
	[STP_TotalSalesAtProcess] [numeric](18, 3) NULL,
	[STP_Currency] [varchar](3) NOT NULL,
	[STP_ProcessDate] [datetime] NOT NULL,
	[STP_PeriodStart] [datetime] NULL,
	[STP_PeriodEnd] [datetime] NULL,
	[STP_CDStamp] [datetime] NOT NULL,
	[STP_CUStamp] [nvarchar](4) NULL,
	[STP_MDStamp] [datetime] NULL,
	[STP_MUStamp] [nvarchar](4) NULL,
 CONSTRAINT [PK_CVR_SettlementPayments] PRIMARY KEY CLUSTERED 
(
	[STP_SettlementPaymentID] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON) ON [PRIMARY]
) ON [PRIMARY]
GO
ALTER TABLE [dbo].[CVR_SettlementPayments] ADD  DEFAULT (getdate()) FOR [STP_ProcessDate]
GO
ALTER TABLE [dbo].[CVR_SettlementPayments] ADD  DEFAULT (getdate()) FOR [STP_CDStamp]
GO
ALTER TABLE [dbo].[CVR_SettlementPayments]  WITH CHECK ADD  CONSTRAINT [FK_CVR_SettlementPayments_Contracts] FOREIGN KEY([STP_ContractID])
REFERENCES [dbo].[CVR_Contracts] ([CTR_ContractID])
GO
ALTER TABLE [dbo].[CVR_SettlementPayments] CHECK CONSTRAINT [FK_CVR_SettlementPayments_Contracts]
GO
ALTER TABLE [dbo].[CVR_SettlementPayments]  WITH CHECK ADD  CONSTRAINT [FK_CVR_SettlementPayments_Fees] FOREIGN KEY([STP_FeeID])
REFERENCES [dbo].[CVR_Fees] ([FEE_FeeID])
GO
ALTER TABLE [dbo].[CVR_SettlementPayments] CHECK CONSTRAINT [FK_CVR_SettlementPayments_Fees]
GO
ALTER TABLE [dbo].[CVR_SettlementPayments]  WITH CHECK ADD  CONSTRAINT [FK_CVR_SettlementPayments_Targets] FOREIGN KEY([STP_TargetID])
REFERENCES [dbo].[CVR_Targets] ([TAR_TargetID])
GO
ALTER TABLE [dbo].[CVR_SettlementPayments] CHECK CONSTRAINT [FK_CVR_SettlementPayments_Targets]
GO
ALTER TABLE [dbo].[CVR_SettlementPayments]  WITH CHECK ADD  CONSTRAINT [CHK_CVR_SettlementPayments_TargetOrFee] CHECK  (([STP_ResultType]='T' AND [STP_TargetID] IS NOT NULL AND [STP_FeeID] IS NULL OR [STP_ResultType]='F' AND [STP_FeeID] IS NOT NULL AND [STP_TargetID] IS NULL))
GO
ALTER TABLE [dbo].[CVR_SettlementPayments] CHECK CONSTRAINT [CHK_CVR_SettlementPayments_TargetOrFee]
GO
