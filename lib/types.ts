export type Currency = "MYR" | "USD" | "SGD" | "HKD" | "GBP" | "EUR" | string;

export type Member = {
  id: string;
  name: string;
  notes: string | null;
  created_at?: string;
};

export type Security = {
  id: string;
  symbol: string;
  name: string;
  currency: Currency;
  current_price: number;
  is_closed: boolean;
  created_at?: string;
};

export type Allocation = {
  member_id: string;
  quantity: number;
};

export type DividendAllocation = {
  member_id: string;
  amount: number;
};

export type Trade = {
  id: string;
  security_id: string;
  trade_date: string;
  type: "buy" | "sell";
  quantity: number;
  price: number;
  fees: number;
  allocations: Allocation[];
  notes: string | null;
  created_at?: string;
};

export type Dividend = {
  id: string;
  security_id: string;
  dividend_date: string;
  gross_amount: number;
  tax: number;
  allocations: DividendAllocation[];
  notes: string | null;
  created_at?: string;
};

export type MemberPosition = {
  member: Member;
  security: Security;
  quantity: number;
  costBasis: number;
  marketValue: number;
  realizedPnL: number;
  unrealizedPnL: number;
  dividends: number;
  totalPnLExcludingDividends: number;
  totalPnLIncludingDividends: number;
};

export type SecuritySummary = {
  security: Security;
  quantity: number;
  costPricePerUnit: number;
  costBasis: number;
  marketValue: number;
  realizedPnL: number;
  unrealizedPnL: number;
  dividends: number;
  totalPnLExcludingDividends: number;
  totalPnLIncludingDividends: number;
  isEffectivelyClosed: boolean;
};

export type PortfolioSummary = {
  memberPositions: MemberPosition[];
  securitySummaries: SecuritySummary[];
  totalsByMember: Array<{
    member: Member;
    costBasis: number;
    marketValue: number;
    realizedPnL: number;
    unrealizedPnL: number;
    dividends: number;
    totalPnLExcludingDividends: number;
    totalPnLIncludingDividends: number;
  }>;
  poolTotals: {
    costBasis: number;
    marketValue: number;
    realizedPnL: number;
    unrealizedPnL: number;
    dividends: number;
    totalPnLExcludingDividends: number;
    totalPnLIncludingDividends: number;
  };
};
