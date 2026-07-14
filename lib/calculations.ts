import type {
  CashLedgerEntry,
  CashTransaction,
  Dividend,
  Member,
  MemberPosition,
  PortfolioSummary,
  Security,
  SecuritySummary,
  Trade
} from "./types";

type RunningLot = {
  quantity: number;
  costBasis: number;
  realizedPnL: number;
};

const emptyTotals = () => ({
  costBasis: 0,
  marketValue: 0,
  realizedPnL: 0,
  unrealizedPnL: 0,
  dividends: 0,
  totalPnLExcludingDividends: 0,
  totalPnLIncludingDividends: 0
});

const money = (value: number) => (Number.isFinite(value) ? value : 0);

export function buildPortfolioSummary(
  members: Member[],
  securities: Security[],
  trades: Trade[],
  dividends: Dividend[],
  cashTransactions: CashTransaction[] = []
): PortfolioSummary {
  const memberMap = new Map(members.map((member) => [member.id, member]));
  const securityMap = new Map(securities.map((security) => [security.id, security]));
  const lots = new Map<string, RunningLot>();
  const dividendTotals = new Map<string, number>();
  const buyTotalsBySecurity = new Map<string, { quantity: number; value: number }>();

  // This counter-level metric intentionally uses every buy trade, independent of
  // member allocations, fees, sales, and member cost-basis calculations.
  for (const trade of trades) {
    if (trade.type !== "buy" || !securityMap.has(trade.security_id) || trade.quantity <= 0) continue;

    const total = buyTotalsBySecurity.get(trade.security_id) ?? { quantity: 0, value: 0 };
    total.quantity += trade.quantity;
    total.value += trade.quantity * trade.price;
    buyTotalsBySecurity.set(trade.security_id, total);
  }

  const keyFor = (securityId: string, memberId: string) => `${securityId}:${memberId}`;
  const getLot = (securityId: string, memberId: string) => {
    const key = keyFor(securityId, memberId);
    const current = lots.get(key);
    if (current) return current;

    const next = { quantity: 0, costBasis: 0, realizedPnL: 0 };
    lots.set(key, next);
    return next;
  };

  const portfolioEvents = [
    ...trades.map((trade) => ({ kind: "trade" as const, date: trade.trade_date, item: trade, order: 1 })),
    ...dividends
      .filter((dividend) => dividend.type === "bonus_issue")
      .map((dividend) => ({ kind: "bonus_issue" as const, date: dividend.dividend_date, item: dividend, order: 0 }))
  ].sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);

  for (const event of portfolioEvents) {
    if (event.kind === "trade") {
      const trade = event.item;
      if (!securityMap.has(trade.security_id) || trade.quantity <= 0) continue;

      for (const allocation of trade.allocations ?? []) {
        if (!memberMap.has(allocation.member_id) || allocation.quantity <= 0) continue;

        const lot = getLot(trade.security_id, allocation.member_id);
        const allocationRatio = allocation.quantity / trade.quantity;
        const feeShare = money(trade.fees) * allocationRatio;

        if (trade.type === "buy") {
          lot.quantity += allocation.quantity;
          lot.costBasis += allocation.quantity * trade.price + feeShare;
        } else {
          const sellQuantity = Math.min(allocation.quantity, lot.quantity);
          const averageCost = lot.quantity > 0 ? lot.costBasis / lot.quantity : 0;
          const proceeds = sellQuantity * trade.price - feeShare;
          const releasedCost = averageCost * sellQuantity;

          lot.quantity -= sellQuantity;
          lot.costBasis -= releasedCost;
          lot.realizedPnL += proceeds - releasedCost;

          if (lot.quantity < 0.000001) {
            lot.quantity = 0;
            lot.costBasis = 0;
          }
        }
      }
      continue;
    }

    const dividend = event.item;
    if (!securityMap.has(dividend.security_id)) continue;

    for (const allocation of dividend.allocations ?? []) {
      if (!memberMap.has(allocation.member_id) || allocation.amount <= 0) continue;

      const lot = getLot(dividend.security_id, allocation.member_id);
      lot.quantity += allocation.amount;
    }
  }

  for (const dividend of dividends) {
    if (dividend.type !== "cash") continue;
    if (!securityMap.has(dividend.security_id)) continue;

    for (const allocation of dividend.allocations ?? []) {
      if (!memberMap.has(allocation.member_id)) continue;

      const key = keyFor(dividend.security_id, allocation.member_id);
      dividendTotals.set(key, money(dividendTotals.get(key) ?? 0) + money(allocation.amount));
    }
  }

  const memberPositions: MemberPosition[] = [];

  for (const [key, lot] of lots.entries()) {
    const [securityId, memberId] = key.split(":");
    const security = securityMap.get(securityId);
    const member = memberMap.get(memberId);
    if (!security || !member) continue;

    const dividendsForPosition = money(dividendTotals.get(key) ?? 0);
    const marketValue = lot.quantity * money(security.current_price);
    const unrealizedPnL = marketValue - lot.costBasis;
    const totalPnLExcludingDividends = lot.realizedPnL + unrealizedPnL;
    const totalPnLIncludingDividends = totalPnLExcludingDividends + dividendsForPosition;

    memberPositions.push({
      member,
      security,
      quantity: lot.quantity,
      costBasis: lot.costBasis,
      marketValue,
      realizedPnL: lot.realizedPnL,
      unrealizedPnL,
      dividends: dividendsForPosition,
      totalPnLExcludingDividends,
      totalPnLIncludingDividends
    });
  }

  for (const [key, amount] of dividendTotals.entries()) {
    if (lots.has(key)) continue;

    const [securityId, memberId] = key.split(":");
    const security = securityMap.get(securityId);
    const member = memberMap.get(memberId);
    if (!security || !member) continue;

    memberPositions.push({
      member,
      security,
      quantity: 0,
      costBasis: 0,
      marketValue: 0,
      realizedPnL: 0,
      unrealizedPnL: 0,
      dividends: amount,
      totalPnLExcludingDividends: 0,
      totalPnLIncludingDividends: amount
    });
  }

  const totalsBySecurity = new Map<string, SecuritySummary>();
  const totalsByMember = new Map<string, ReturnType<typeof emptyTotals> & { member: Member }>();
  const poolTotals = emptyTotals();

  for (const position of memberPositions) {
    const securityTotal =
      totalsBySecurity.get(position.security.id) ??
      ({
        security: position.security,
        quantity: 0,
        costPricePerUnit: (() => {
          const buys = buyTotalsBySecurity.get(position.security.id);
          return buys && buys.quantity > 0 ? buys.value / buys.quantity : 0;
        })(),
        isEffectivelyClosed: false,
        ...emptyTotals()
      } satisfies SecuritySummary);

    securityTotal.quantity += position.quantity;
    securityTotal.costBasis += position.costBasis;
    securityTotal.marketValue += position.marketValue;
    securityTotal.realizedPnL += position.realizedPnL;
    securityTotal.unrealizedPnL += position.unrealizedPnL;
    securityTotal.dividends += position.dividends;
    securityTotal.totalPnLExcludingDividends += position.totalPnLExcludingDividends;
    securityTotal.totalPnLIncludingDividends += position.totalPnLIncludingDividends;
    securityTotal.isEffectivelyClosed = position.security.is_closed || securityTotal.quantity <= 0.000001;
    totalsBySecurity.set(position.security.id, securityTotal);

    const memberTotal = totalsByMember.get(position.member.id) ?? {
      member: position.member,
      ...emptyTotals()
    };

    memberTotal.costBasis += position.costBasis;
    memberTotal.marketValue += position.marketValue;
    memberTotal.realizedPnL += position.realizedPnL;
    memberTotal.unrealizedPnL += position.unrealizedPnL;
    memberTotal.dividends += position.dividends;
    memberTotal.totalPnLExcludingDividends += position.totalPnLExcludingDividends;
    memberTotal.totalPnLIncludingDividends += position.totalPnLIncludingDividends;
    totalsByMember.set(position.member.id, memberTotal);

    poolTotals.costBasis += position.costBasis;
    poolTotals.marketValue += position.marketValue;
    poolTotals.realizedPnL += position.realizedPnL;
    poolTotals.unrealizedPnL += position.unrealizedPnL;
    poolTotals.dividends += position.dividends;
    poolTotals.totalPnLExcludingDividends += position.totalPnLExcludingDividends;
    poolTotals.totalPnLIncludingDividends += position.totalPnLIncludingDividends;
  }

  // Keep every saved counter visible, even before it has a member position.
  // This does not contribute anything to member totals or portfolio P/L.
  for (const security of securities) {
    if (totalsBySecurity.has(security.id)) continue;

    const buys = buyTotalsBySecurity.get(security.id);
    totalsBySecurity.set(security.id, {
      security,
      quantity: 0,
      costPricePerUnit: buys && buys.quantity > 0 ? buys.value / buys.quantity : 0,
      isEffectivelyClosed: security.is_closed,
      ...emptyTotals()
    });
  }

  return {
    memberPositions: memberPositions.sort((a, b) =>
      `${a.security.symbol}:${a.member.name}`.localeCompare(`${b.security.symbol}:${b.member.name}`)
    ),
    securitySummaries: [...totalsBySecurity.values()].sort((a, b) =>
      a.security.symbol.localeCompare(b.security.symbol)
    ),
    totalsByMember: [...totalsByMember.values()].sort((a, b) => a.member.name.localeCompare(b.member.name)),
    poolTotals,
    cashBalance: calculateCashBalance(cashTransactions, trades),
    portfolioValue: poolTotals.marketValue + calculateCashBalance(cashTransactions, trades)
  };
}

export function cashImpactForTrade(trade: Pick<Trade, "type" | "quantity" | "price" | "fees">) {
  const tradeValue = money(trade.quantity) * money(trade.price);
  return trade.type === "buy" ? -(tradeValue + money(trade.fees)) : tradeValue - money(trade.fees);
}

export function calculateCashBalance(cashTransactions: CashTransaction[], trades: Trade[]) {
  const manualCash = cashTransactions.reduce(
    (balance, transaction) => balance + (transaction.type === "deposit" ? money(transaction.amount) : -money(transaction.amount)),
    0
  );
  return manualCash + trades.reduce((balance, trade) => balance + cashImpactForTrade(trade), 0);
}

export function buildCashLedger(
  cashTransactions: CashTransaction[],
  trades: Trade[],
  securities: Security[]
): CashLedgerEntry[] {
  const securityMap = new Map(securities.map((security) => [security.id, security]));
  const entries = [
    ...cashTransactions.map((transaction): Omit<CashLedgerEntry, "runningBalance"> => ({
      id: `cash:${transaction.id}`,
      date: transaction.transaction_date,
      type: transaction.type,
      description: transaction.reference || (transaction.type === "deposit" ? "Cash deposit" : "Cash withdrawal"),
      debit: transaction.type === "withdrawal" ? money(transaction.amount) : 0,
      credit: transaction.type === "deposit" ? money(transaction.amount) : 0,
      createdBy: transaction.created_by || "Manual entry"
    })),
    ...trades.map((trade): Omit<CashLedgerEntry, "runningBalance"> => {
      const security = securityMap.get(trade.security_id);
      const amount = Math.abs(cashImpactForTrade(trade));
      const isBuy = trade.type === "buy";
      return {
        id: `trade:${trade.id}`,
        date: trade.trade_date,
        type: trade.type,
        description: `${isBuy ? "Buy" : "Sell"} ${trade.quantity} ${security?.symbol ?? "counter"}${trade.notes ? ` — ${trade.notes}` : ""}`,
        debit: isBuy ? amount : 0,
        credit: isBuy ? 0 : amount,
        createdBy: "Trade entry"
      };
    })
  ].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  let runningBalance = 0;
  return entries.map((entry) => {
    runningBalance += entry.credit - entry.debit;
    return { ...entry, runningBalance };
  });
}

export function formatMoney(value: number, currency = "MYR") {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(money(value));
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-MY", {
    maximumFractionDigits: 4
  }).format(money(value));
}
