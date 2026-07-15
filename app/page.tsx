"use client";

import { FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { buildCashLedger, buildPortfolioSummary, formatMoney, formatNumber } from "@/lib/calculations";
import { hasSupabaseConfig, supabase } from "@/lib/supabase";
import type { CashTransaction, Dividend, DividendAllocation, Member, Security, Trade } from "@/lib/types";

const today = new Date().toISOString().slice(0, 10);
const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

type LoadState = "idle" | "loading" | "ready" | "error";

const numeric = (value: string | number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const describeSupabaseError = (error: { message?: string; details?: string; hint?: string } | null | undefined) =>
  [error?.message, error?.details, error?.hint].filter(Boolean).join(" | ");

const normalizeMember = (row: Member): Member => ({
  ...row,
  notes: row.notes ?? null
});

const normalizeSecurity = (row: Security): Security => ({
  ...row,
  current_price: numeric(row.current_price)
});

const normalizeTrade = (row: Trade): Trade => ({
  ...row,
  instrument_type: row.instrument_type ?? "stock",
  quantity: numeric(row.quantity),
  price: numeric(row.price),
  fees: numeric(row.fees),
  warrant_code: row.warrant_code ?? null,
  allocations: row.allocations ?? [],
  notes: row.notes ?? null
});

const normalizeDividend = (row: Dividend): Dividend => ({
  ...row,
  type: row.type ?? "cash",
  gross_amount: numeric(row.gross_amount),
  tax: numeric(row.tax),
  warrant_code: row.warrant_code ?? null,
  bonus_ratio: row.bonus_ratio ?? null,
  warrant_quantity_received: row.warrant_quantity_received == null ? null : numeric(row.warrant_quantity_received),
  exercise_price: row.exercise_price == null ? null : numeric(row.exercise_price),
  market_price: row.market_price == null ? null : numeric(row.market_price),
  expiry_date: row.expiry_date ?? null,
  allocations: row.allocations ?? [],
  notes: row.notes ?? null
});

const normalizeCashTransaction = (row: CashTransaction): CashTransaction => ({
  ...row,
  amount: numeric(row.amount),
  reference: row.reference ?? null,
  created_by: row.created_by || "Manual entry"
});

export default function Home() {
  const [members, setMembers] = useState<Member[]>([]);
  const [securities, setSecurities] = useState<Security[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [dividends, setDividends] = useState<Dividend[]>([]);
  const [cashTransactions, setCashTransactions] = useState<CashTransaction[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [message, setMessage] = useState("");

  const [memberName, setMemberName] = useState("");
  const [memberNotes, setMemberNotes] = useState("");

  const [symbol, setSymbol] = useState("");
  const [securityName, setSecurityName] = useState("");
  const [currency, setCurrency] = useState("MYR");
  const [currentPrice, setCurrentPrice] = useState("");

  const [tradeSecurityId, setTradeSecurityId] = useState("");
  const [tradeDate, setTradeDate] = useState(today);
  const [tradeType, setTradeType] = useState<"buy" | "sell">("buy");
  const [tradeQuantity, setTradeQuantity] = useState("");
  const [tradePrice, setTradePrice] = useState("");
  const [tradeFees, setTradeFees] = useState("");
  const [tradeNotes, setTradeNotes] = useState("");
  const [tradeAllocations, setTradeAllocations] = useState<Record<string, string>>({});
  const [editingTradeId, setEditingTradeId] = useState<string | null>(null);

  const [warrantTradeSecurityId, setWarrantTradeSecurityId] = useState("");
  const [warrantTradeDate, setWarrantTradeDate] = useState(today);
  const [warrantTradeType, setWarrantTradeType] = useState<"buy" | "sell">("buy");
  const [warrantTradeQuantity, setWarrantTradeQuantity] = useState("");
  const [warrantTradePrice, setWarrantTradePrice] = useState("");
  const [warrantTradeFees, setWarrantTradeFees] = useState("");
  const [warrantTradeCode, setWarrantTradeCode] = useState("");
  const [warrantTradeNotes, setWarrantTradeNotes] = useState("");
  const [warrantTradeAllocations, setWarrantTradeAllocations] = useState<Record<string, string>>({});
  const [editingWarrantTradeId, setEditingWarrantTradeId] = useState<string | null>(null);

  const [dividendSecurityId, setDividendSecurityId] = useState("");
  const [dividendDate, setDividendDate] = useState(today);
  const [dividendType, setDividendType] = useState<Dividend["type"]>("cash");
  const [grossDividend, setGrossDividend] = useState("");
  const [dividendTax, setDividendTax] = useState("");
  const [dividendNotes, setDividendNotes] = useState("");
  const [warrantCode, setWarrantCode] = useState("");
  const [warrantBonusRatio, setWarrantBonusRatio] = useState("");
  const [warrantQuantityReceived, setWarrantQuantityReceived] = useState("");
  const [warrantExercisePrice, setWarrantExercisePrice] = useState("");
  const [warrantMarketPrice, setWarrantMarketPrice] = useState("");
  const [warrantExpiryDate, setWarrantExpiryDate] = useState("");
  const [dividendAllocations, setDividendAllocations] = useState<Record<string, string>>({});
  const [editingDividendId, setEditingDividendId] = useState<string | null>(null);
  const [tradeHistoryCounter, setTradeHistoryCounter] = useState("all");
  const [tradeHistoryInstrument, setTradeHistoryInstrument] = useState<"all" | "stock" | "warrant">("all");
  const [dividendHistoryCounter, setDividendHistoryCounter] = useState("all");

  const [cashDate, setCashDate] = useState(today);
  const [cashType, setCashType] = useState<"deposit" | "withdrawal">("deposit");
  const [cashAmount, setCashAmount] = useState("");
  const [cashReference, setCashReference] = useState("");
  const [cashCreatedBy, setCashCreatedBy] = useState("Manual entry");
  const [ledgerStartDate, setLedgerStartDate] = useState("");
  const [ledgerEndDate, setLedgerEndDate] = useState("");
  const [ledgerType, setLedgerType] = useState<"all" | "deposit" | "withdrawal" | "buy" | "sell">("all");

  const summary = useMemo(
    () => buildPortfolioSummary(members, securities, trades, dividends, cashTransactions),
    [members, securities, trades, dividends, cashTransactions]
  );
  const cashLedger = useMemo(
    () => buildCashLedger(cashTransactions, trades, securities),
    [cashTransactions, trades, securities]
  );
  const filteredCashLedger = cashLedger.filter((entry) =>
    (!ledgerStartDate || entry.date >= ledgerStartDate) &&
    (!ledgerEndDate || entry.date <= ledgerEndDate) &&
    (ledgerType === "all" || entry.type === ledgerType)
  );
  const filteredTrades = trades.filter((trade) =>
    (tradeHistoryCounter === "all" || trade.security_id === tradeHistoryCounter) &&
    (tradeHistoryInstrument === "all" || trade.instrument_type === tradeHistoryInstrument)
  );
  const filteredDividends = dividends.filter((dividend) => dividendHistoryCounter === "all" || dividend.security_id === dividendHistoryCounter);

  const selectedTradeSecurity = securities.find((security) => security.id === tradeSecurityId);
  const selectedWarrantTradeSecurity = securities.find((security) => security.id === warrantTradeSecurityId);
  const selectedDividendSecurity = securities.find((security) => security.id === dividendSecurityId);

  async function loadData() {
    if (!supabase) return;
    setLoadState("loading");
    setMessage("");

    const [membersResult, securitiesResult, tradesResult, dividendsResult, cashResult] = await Promise.all([
      supabase.from("members").select("*").order("created_at", { ascending: true }),
      supabase.from("securities").select("*").order("symbol", { ascending: true }),
      supabase.from("trades").select("*").order("trade_date", { ascending: false }),
      supabase.from("dividends").select("*").order("dividend_date", { ascending: false }),
      supabase.from("cash_transactions").select("*").order("transaction_date", { ascending: false })
    ]);

    const coreError = membersResult.error ?? securitiesResult.error ?? tradesResult.error ?? dividendsResult.error;
    if (coreError) {
      setLoadState("error");
      setMessage(coreError.message);
      return;
    }

    setMembers((membersResult.data ?? []).map(normalizeMember));
    setSecurities((securitiesResult.data ?? []).map(normalizeSecurity));
    setTrades((tradesResult.data ?? []).map(normalizeTrade));
    setDividends((dividendsResult.data ?? []).map(normalizeDividend));
    if (cashResult.error) {
      setCashTransactions([]);
      setMessage("Cash account is unavailable until the cash_transactions migration is run in Supabase.");
    } else {
      setCashTransactions((cashResult.data ?? []).map(normalizeCashTransaction));
    }
    setLoadState("ready");
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function addMember(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !memberName.trim()) return;

    const { error } = await supabase.from("members").insert({
      name: memberName.trim(),
      notes: memberNotes.trim() || null
    });

    if (error) return setMessage(describeSupabaseError(error));
    setMemberName("");
    setMemberNotes("");
    await loadData();
  }

  async function addSecurity(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !symbol.trim()) return;

    const { error } = await supabase.from("securities").insert({
      symbol: symbol.trim().toUpperCase(),
      name: securityName.trim(),
      currency: currency.trim().toUpperCase() || "MYR",
      current_price: numeric(currentPrice)
    });

    if (error) return setMessage(describeSupabaseError(error));
    setSymbol("");
    setSecurityName("");
    setCurrentPrice("");
    await loadData();
  }

  async function updateSecurity(security: Security, patch: Partial<Security>) {
    if (!supabase) return;
    const { error } = await supabase.from("securities").update(patch).eq("id", security.id);
    if (error) return setMessage(error.message);
    await loadData();
  }

  function splitTradeEvenly() {
    if (!members.length) return;
    const share = numeric(tradeQuantity) / members.length;
    setTradeAllocations(Object.fromEntries(members.map((member) => [member.id, String(share)])));
  }

  function splitWarrantTradeEvenly() {
    if (!members.length) return;
    const share = numeric(warrantTradeQuantity) / members.length;
    setWarrantTradeAllocations(Object.fromEntries(members.map((member) => [member.id, String(share)])));
  }

  function splitDividendEvenly() {
    if (!members.length) return;
    const total = dividendType === "bonus_issue" ? numeric(grossDividend) : numeric(grossDividend) - numeric(dividendTax);
    const share = total / members.length;
    setDividendAllocations(Object.fromEntries(members.map((member) => [member.id, String(share)])));
  }

  function resetTradeForm() {
    setEditingTradeId(null);
    setEditingWarrantTradeId(null);
    setTradeSecurityId("");
    setTradeDate(today);
    setTradeType("buy");
    setTradeQuantity("");
    setTradePrice("");
    setTradeFees("");
    setTradeNotes("");
    setTradeAllocations({});
  }

  function resetWarrantTradeForm() {
    setEditingWarrantTradeId(null);
    setEditingTradeId(null);
    setWarrantTradeSecurityId("");
    setWarrantTradeDate(today);
    setWarrantTradeType("buy");
    setWarrantTradeQuantity("");
    setWarrantTradePrice("");
    setWarrantTradeFees("");
    setWarrantTradeCode("");
    setWarrantTradeNotes("");
    setWarrantTradeAllocations({});
  }

  async function saveTrade(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !tradeSecurityId) return;

    const quantity = numeric(tradeQuantity);
    const allocations = Object.entries(tradeAllocations)
      .map(([member_id, value]) => ({ member_id, quantity: numeric(value) }))
      .filter((allocation) => allocation.quantity > 0);
    const allocatedQuantity = allocations.reduce((sum, allocation) => sum + allocation.quantity, 0);

    if (Math.abs(allocatedQuantity - quantity) > 0.0001) {
      setMessage("Trade allocation must add up to the total trade quantity.");
      return;
    }

    const trade = {
      security_id: tradeSecurityId,
      trade_date: tradeDate,
      type: tradeType,
      quantity,
      price: numeric(tradePrice),
      fees: numeric(tradeFees),
      allocations,
      notes: tradeNotes.trim() || null
    };

    const { error } = editingTradeId
      ? await supabase.from("trades").update(trade).eq("id", editingTradeId)
      : await supabase.from("trades").insert({ ...trade, instrument_type: "stock" as const });

    if (error) return setMessage(error.message);
    resetTradeForm();
    await loadData();
  }

  async function saveWarrantTrade(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !warrantTradeSecurityId) return;

    const quantity = numeric(warrantTradeQuantity);
    const allocations = Object.entries(warrantTradeAllocations)
      .map(([member_id, value]) => ({ member_id, quantity: numeric(value) }))
      .filter((allocation) => allocation.quantity > 0);
    const allocatedQuantity = allocations.reduce((sum, allocation) => sum + allocation.quantity, 0);

    if (Math.abs(allocatedQuantity - quantity) > 0.0001) {
      setMessage("Trade allocation must add up to the total trade quantity.");
      return;
    }

    if (!warrantTradeCode.trim()) {
      setMessage("Enter a warrant code for warrant trades.");
      return;
    }

    const trade = {
      security_id: warrantTradeSecurityId,
      trade_date: warrantTradeDate,
      instrument_type: "warrant" as const,
      type: warrantTradeType,
      quantity,
      price: numeric(warrantTradePrice),
      fees: numeric(warrantTradeFees),
      warrant_code: warrantTradeCode.trim(),
      allocations,
      notes: warrantTradeNotes.trim() || null
    };

    const { error } = editingWarrantTradeId
      ? await supabase.from("trades").update(trade).eq("id", editingWarrantTradeId)
      : await supabase.from("trades").insert(trade);

    if (error) return setMessage(error.message);
    resetWarrantTradeForm();
    await loadData();
  }

  async function addCashTransaction(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;

    const amount = numeric(cashAmount);
    if (amount <= 0) {
      setMessage("Enter a cash amount greater than zero.");
      return;
    }
    const { error } = await supabase.from("cash_transactions").insert({
      transaction_date: cashDate,
      type: cashType,
      amount,
      reference: cashReference.trim() || null,
      created_by: cashCreatedBy.trim() || "Manual entry"
    });
    if (error) return setMessage(error.message);
    setCashAmount("");
    setCashReference("");
    await loadData();
  }

  function resetDividendForm() {
    setEditingDividendId(null);
    setDividendSecurityId("");
    setDividendDate(today);
    setDividendType("cash");
    setGrossDividend("");
    setDividendTax("");
    setDividendNotes("");
    setWarrantCode("");
    setWarrantBonusRatio("");
    setWarrantQuantityReceived("");
    setWarrantExercisePrice("");
    setWarrantMarketPrice("");
    setWarrantExpiryDate("");
    setDividendAllocations({});
  }

  async function saveDividend(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !dividendSecurityId) return;

    const bonusShares = numeric(grossDividend);
    if (dividendType === "bonus_issue" && bonusShares <= 0) {
      setMessage("Enter a bonus share quantity greater than zero.");
      return;
    }

    const warrantShares = numeric(warrantQuantityReceived);
    const warrantPrice = numeric(warrantExercisePrice);
    if (dividendType === "warrant_bonus") {
      if (!warrantCode.trim()) {
        setMessage("Enter a warrant code.");
        return;
      }
      if (!warrantBonusRatio.trim()) {
        setMessage("Enter a warrant bonus ratio.");
        return;
      }
      if (warrantShares <= 0) {
        setMessage("Enter a warrant quantity greater than zero.");
        return;
      }
      if (warrantPrice <= 0) {
        setMessage("Enter a valid exercise price.");
        return;
      }
    }

    const allocations: DividendAllocation[] = dividendType === "bonus_issue"
      ? []
      : Object.entries(dividendAllocations)
          .map(([member_id, value]) => ({ member_id, amount: numeric(value) }))
          .filter((allocation) => allocation.amount !== 0);

    if (dividendType === "cash") {
      const netDividend = numeric(grossDividend) - numeric(dividendTax);
      const allocatedAmount = allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
      if (Math.abs(allocatedAmount - netDividend) > 0.01) {
        setMessage("Dividend allocation must add up to the net dividend after tax.");
        return;
      }
    }

    const dividend = {
      security_id: dividendSecurityId,
      dividend_date: dividendDate,
      type: dividendType,
      gross_amount: dividendType === "warrant_bonus" ? warrantShares : bonusShares,
      tax: dividendType === "bonus_issue" || dividendType === "warrant_bonus" ? 0 : numeric(dividendTax),
      allocations,
      notes: dividendNotes.trim() || null
    };

    if (dividendType === "warrant_bonus") {
      Object.assign(dividend, {
        warrant_code: warrantCode.trim(),
        bonus_ratio: warrantBonusRatio.trim(),
        warrant_quantity_received: warrantShares,
        exercise_price: warrantPrice,
        ...(warrantMarketPrice.trim() ? { market_price: numeric(warrantMarketPrice) } : {}),
        ...(warrantExpiryDate ? { expiry_date: warrantExpiryDate } : {})
      });
    }

    const { error } = editingDividendId
      ? await supabase.from("dividends").update(dividend).eq("id", editingDividendId)
      : await supabase.from("dividends").insert(dividend);

    if (error) return setMessage(error.message);
    resetDividendForm();
    await loadData();
  }

  function editTrade(trade: Trade) {
    if (trade.instrument_type === "warrant") {
      resetTradeForm();
      setEditingWarrantTradeId(trade.id);
      setWarrantTradeSecurityId(trade.security_id);
      setWarrantTradeDate(trade.trade_date);
      setWarrantTradeType(trade.type);
      setWarrantTradeQuantity(String(trade.quantity));
      setWarrantTradePrice(String(trade.price));
      setWarrantTradeFees(String(trade.fees));
      setWarrantTradeCode(trade.warrant_code ?? "");
      setWarrantTradeNotes(trade.notes ?? "");
      setWarrantTradeAllocations(Object.fromEntries(trade.allocations.map((item) => [item.member_id, String(item.quantity)])));
      return;
    }
    resetWarrantTradeForm();
    setEditingTradeId(trade.id);
    setTradeSecurityId(trade.security_id);
    setTradeDate(trade.trade_date);
    setTradeType(trade.type);
    setTradeQuantity(String(trade.quantity));
    setTradePrice(String(trade.price));
    setTradeFees(String(trade.fees));
    setTradeNotes(trade.notes ?? "");
    setTradeAllocations(Object.fromEntries(trade.allocations.map((item) => [item.member_id, String(item.quantity)])));
  }

  function editDividend(dividend: Dividend) {
    setEditingDividendId(dividend.id);
    setDividendSecurityId(dividend.security_id);
    setDividendDate(dividend.dividend_date);
    setDividendType(dividend.type);
    setGrossDividend(String(dividend.gross_amount));
    setDividendTax(String(dividend.tax));
    setDividendNotes(dividend.notes ?? "");
    setWarrantCode(dividend.warrant_code ?? "");
    setWarrantBonusRatio(dividend.bonus_ratio ?? "");
    setWarrantQuantityReceived(String(dividend.warrant_quantity_received ?? ""));
    setWarrantExercisePrice(String(dividend.exercise_price ?? ""));
    setWarrantMarketPrice(String(dividend.market_price ?? ""));
    setWarrantExpiryDate(dividend.expiry_date ?? "");
    setDividendAllocations(Object.fromEntries(dividend.allocations.map((item) => [item.member_id, String(item.amount)])));
  }

  async function deleteHistoryItem(table: "trades" | "dividends", id: string) {
    if (!supabase || !window.confirm("Delete this record? This cannot be undone.")) return;
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) return setMessage(error.message);
    if (table === "trades" && editingTradeId === id) resetTradeForm();
    if (table === "trades" && editingWarrantTradeId === id) resetWarrantTradeForm();
    if (table === "dividends" && editingDividendId === id) resetDividendForm();
    await loadData();
  }

  return (
    <main className="shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Manual pool account</p>
          <h1>Stock Pool Tracker</h1>
        </div>
        <div className="status">
          {hasSupabaseConfig ? loadState : "missing env"}
        </div>
      </section>

      {!hasSupabaseConfig ? (
        <section className="notice">
          Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to `.env.local` and Vercel. Run
          `supabase/schema.sql` in Supabase first.
        </section>
      ) : null}

      {message ? <section className="notice error">{message}</section> : null}

      <section className="metrics">
        <Metric label="Stock holdings" value={formatMoney(summary.poolTotals.marketValue)} />
        <Metric label="Cash balance" value={formatMoney(summary.cashBalance)} />
        <Metric label="Portfolio value" value={formatMoney(summary.portfolioValue)} />
        <Metric label="Cost basis" value={formatMoney(summary.poolTotals.costBasis)} />
        <Metric label="P/L excl. dividend" value={formatMoney(summary.poolTotals.totalPnLExcludingDividends)} />
        <Metric label="P/L incl. dividend" value={formatMoney(summary.poolTotals.totalPnLIncludingDividends)} />
      </section>

      <section className="panel">
        <h2>Member pool holding</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Holding</th>
                <th>Cost</th>
                <th>Realized</th>
                <th>Unrealized</th>
                <th>Dividend</th>
                <th>P/L excl.</th>
                <th>P/L incl.</th>
              </tr>
            </thead>
            <tbody>
              {summary.totalsByMember.map((row) => (
                <tr key={row.member.id}>
                  <td>{row.member.name}</td>
                  <td>{formatMoney(row.marketValue)}</td>
                  <td>{formatMoney(row.costBasis)}</td>
                  <td className={tone(row.realizedPnL)}>{formatMoney(row.realizedPnL)}</td>
                  <td className={tone(row.unrealizedPnL)}>{formatMoney(row.unrealizedPnL)}</td>
                  <td>{formatMoney(row.dividends)}</td>
                  <td className={tone(row.totalPnLExcludingDividends)}>{formatMoney(row.totalPnLExcludingDividends)}</td>
                  <td className={tone(row.totalPnLIncludingDividends)}>{formatMoney(row.totalPnLIncludingDividends)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <form className="panel cash-form" onSubmit={addCashTransaction}>
        <div className="section-heading">
          <div>
            <h2>Cash account</h2>
            <p className="hint">Current balance: {formatMoney(summary.cashBalance)}</p>
          </div>
        </div>
        <div className="cash-form-grid">
          <label>
            Transaction date
            <DateSelector value={cashDate} onChange={setCashDate} />
          </label>
          <label>
            Type
            <select value={cashType} onChange={(event) => setCashType(event.target.value as "deposit" | "withdrawal")}>
              <option value="deposit">Deposit</option>
              <option value="withdrawal">Withdrawal</option>
            </select>
          </label>
          <label>
            Amount
            <input inputMode="decimal" value={cashAmount} onChange={(event) => setCashAmount(event.target.value)} placeholder="0.00" />
          </label>
          <label>
            Reference / remarks
            <input value={cashReference} onChange={(event) => setCashReference(event.target.value)} placeholder="Opening capital" />
          </label>
          <label>
            Created by
            <input value={cashCreatedBy} onChange={(event) => setCashCreatedBy(event.target.value)} placeholder="Manual entry" />
          </label>
        </div>
        <div className="form-actions">
          <button type="submit">Record {cashType === "deposit" ? "deposit" : "withdrawal"}</button>
        </div>
      </form>

      <section className="grid two">
        <form className="panel" onSubmit={addMember}>
          <h2>Add member</h2>
          <label>
            Name
            <input value={memberName} onChange={(event) => setMemberName(event.target.value)} placeholder="Dad" />
          </label>
          <label>
            Notes
            <input value={memberNotes} onChange={(event) => setMemberNotes(event.target.value)} placeholder="Optional" />
          </label>
          <button type="submit">Add member</button>
        </form>

        <form className="panel" onSubmit={addSecurity}>
          <h2>Add stock counter</h2>
          <div className="row">
            <label>
              Symbol
              <input value={symbol} onChange={(event) => setSymbol(event.target.value)} placeholder="MAYBANK" />
            </label>
            <label>
              Currency
              <input value={currency} onChange={(event) => setCurrency(event.target.value)} />
            </label>
          </div>
          <label>
            Name
            <input value={securityName} onChange={(event) => setSecurityName(event.target.value)} placeholder="Malayan Banking" />
          </label>
          <label>
            Current price
            <input inputMode="decimal" value={currentPrice} onChange={(event) => setCurrentPrice(event.target.value)} />
          </label>
          <button type="submit">Add counter</button>
        </form>
      </section>

      <section className="grid two">
        <div className="stack">
          <form className="panel" onSubmit={saveTrade}>
            <h2>{editingTradeId ? "Edit stock trade" : "Add stock trade"}</h2>
            <div className="row">
              <label>
                Counter
                <select value={tradeSecurityId} onChange={(event) => setTradeSecurityId(event.target.value)}>
                  <option value="">Select</option>
                  {securities.map((security) => (
                    <option key={security.id} value={security.id}>
                      {security.symbol}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Type
                <select value={tradeType} onChange={(event) => setTradeType(event.target.value as "buy" | "sell")}>
                  <option value="buy">Buy</option>
                  <option value="sell">Sell</option>
                </select>
              </label>
            </div>
            <div className="row">
              <label>
                Date
                <DateSelector value={tradeDate} onChange={setTradeDate} />
              </label>
              <label>
                Quantity
                <input inputMode="decimal" value={tradeQuantity} onChange={(event) => setTradeQuantity(event.target.value)} />
              </label>
            </div>
            <div className="row">
              <label>
                Price
                <input inputMode="decimal" value={tradePrice} onChange={(event) => setTradePrice(event.target.value)} />
              </label>
              <label>
                Fees
                <input inputMode="decimal" value={tradeFees} onChange={(event) => setTradeFees(event.target.value)} />
              </label>
            </div>
            <AllocationInputs
              members={members}
              values={tradeAllocations}
              setValues={setTradeAllocations}
              label="Member quantity"
              onEvenSplit={splitTradeEvenly}
            />
            <label>
              Notes
              <input value={tradeNotes} onChange={(event) => setTradeNotes(event.target.value)} placeholder="Optional" />
            </label>
            <div className="form-actions">
              <button type="submit">{editingTradeId ? "Update stock trade" : "Save stock trade"}</button>
              {editingTradeId ? <button type="button" className="secondary" onClick={resetTradeForm}>Cancel</button> : null}
            </div>
            {selectedTradeSecurity ? (
              <p className="hint">Using {selectedTradeSecurity.currency} for this counter.</p>
            ) : null}
          </form>

          <form className="panel" onSubmit={saveWarrantTrade}>
            <h2>{editingWarrantTradeId ? "Edit warrant trade" : "Add warrant trade"}</h2>
            <div className="row">
              <label>
                Counter
                <select value={warrantTradeSecurityId} onChange={(event) => setWarrantTradeSecurityId(event.target.value)}>
                  <option value="">Select</option>
                  {securities.map((security) => (
                    <option key={security.id} value={security.id}>
                      {security.symbol}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Type
                <select value={warrantTradeType} onChange={(event) => setWarrantTradeType(event.target.value as "buy" | "sell")}>
                  <option value="buy">Buy</option>
                  <option value="sell">Sell</option>
                </select>
              </label>
            </div>
            <div className="row">
              <label>
                Warrant code
                <input value={warrantTradeCode} onChange={(event) => setWarrantTradeCode(event.target.value)} placeholder="WA_ABC" />
              </label>
              <label>
                Date
                <DateSelector value={warrantTradeDate} onChange={setWarrantTradeDate} />
              </label>
            </div>
            <div className="row">
              <label>
                Quantity
                <input inputMode="decimal" value={warrantTradeQuantity} onChange={(event) => setWarrantTradeQuantity(event.target.value)} />
              </label>
              <label>
                Price
                <input inputMode="decimal" value={warrantTradePrice} onChange={(event) => setWarrantTradePrice(event.target.value)} />
              </label>
            </div>
            <div className="row">
              <label>
                Fees
                <input inputMode="decimal" value={warrantTradeFees} onChange={(event) => setWarrantTradeFees(event.target.value)} />
              </label>
              <div />
            </div>
            <AllocationInputs
              members={members}
              values={warrantTradeAllocations}
              setValues={setWarrantTradeAllocations}
              label="Member quantity"
              onEvenSplit={splitWarrantTradeEvenly}
            />
            <label>
              Notes
              <input value={warrantTradeNotes} onChange={(event) => setWarrantTradeNotes(event.target.value)} placeholder="Optional" />
            </label>
            <div className="form-actions">
              <button type="submit">{editingWarrantTradeId ? "Update warrant trade" : "Save warrant trade"}</button>
              {editingWarrantTradeId ? <button type="button" className="secondary" onClick={resetWarrantTradeForm}>Cancel</button> : null}
            </div>
            {selectedWarrantTradeSecurity ? (
              <p className="hint">Warrant trades use the cash account and are tracked separately from stock trades.</p>
            ) : null}
          </form>
        </div>

        <form className="panel" onSubmit={saveDividend}>
          <h2>{editingDividendId ? "Edit dividend" : "Add dividend"}</h2>
          <div className="row">
            <label>
              Counter
              <select value={dividendSecurityId} onChange={(event) => setDividendSecurityId(event.target.value)}>
                <option value="">Select</option>
                {securities.map((security) => (
                  <option key={security.id} value={security.id}>
                    {security.symbol}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {dividendType === "warrant_bonus" ? "Effective date" : "Date"}
              <DateSelector value={dividendDate} onChange={setDividendDate} />
            </label>
          </div>
          <label>
            Dividend type
            <select value={dividendType} onChange={(event) => setDividendType(event.target.value as Dividend["type"])}>
              <option value="cash">Cash dividend</option>
              <option value="bonus_issue">Bonus issue</option>
              <option value="warrant_bonus">Warrant bonus</option>
            </select>
          </label>
          {dividendType === "bonus_issue" ? (
            <label>
              Bonus shares to issue
              <input
                inputMode="decimal"
                value={grossDividend}
                onChange={(event) => setGrossDividend(event.target.value)}
                placeholder="1000"
              />
            </label>
          ) : dividendType === "warrant_bonus" ? (
            <>
              <div className="row">
                <label>
                  Warrant code
                  <input value={warrantCode} onChange={(event) => setWarrantCode(event.target.value)} placeholder="WA_ABC" />
                </label>
                <label>
                  Bonus ratio
                  <input value={warrantBonusRatio} onChange={(event) => setWarrantBonusRatio(event.target.value)} placeholder="1:2" />
                </label>
              </div>
              <div className="row">
                <label>
                  Warrant quantity received
                  <input inputMode="decimal" value={warrantQuantityReceived} onChange={(event) => setWarrantQuantityReceived(event.target.value)} placeholder="5000" />
                </label>
                <label>
                  Exercise price
                  <input inputMode="decimal" value={warrantExercisePrice} onChange={(event) => setWarrantExercisePrice(event.target.value)} placeholder="0.5000" />
                </label>
              </div>
              <div className="row">
                <label>
                  Market price
                  <input inputMode="decimal" value={warrantMarketPrice} onChange={(event) => setWarrantMarketPrice(event.target.value)} placeholder="0.6000" />
                </label>
                <label>
                  Expiry date
                  <DateSelector value={warrantExpiryDate} onChange={setWarrantExpiryDate} allowEmpty />
                </label>
              </div>
              <p className="hint">
                Warrant holdings are created from current member ownership percentages and do not change stock quantity, stock cost, member fund cost, or cash.
              </p>
            </>
          ) : (
            <div className="row">
              <label>
                Gross dividend
                <input inputMode="decimal" value={grossDividend} onChange={(event) => setGrossDividend(event.target.value)} />
              </label>
              <label>
                Tax
                <input inputMode="decimal" value={dividendTax} onChange={(event) => setDividendTax(event.target.value)} />
              </label>
            </div>
          )}
          {dividendType === "cash" ? (
            <AllocationInputs
              members={members}
              values={dividendAllocations}
              setValues={setDividendAllocations}
              label="Member net amount"
              onEvenSplit={splitDividendEvenly}
            />
          ) : null}
          <label>
            {dividendType === "warrant_bonus" ? "Remarks" : "Notes"}
            <input value={dividendNotes} onChange={(event) => setDividendNotes(event.target.value)} placeholder="Optional" />
          </label>
          <div className="form-actions">
            <button type="submit">{editingDividendId ? "Update dividend" : "Save dividend"}</button>
            {editingDividendId ? <button type="button" className="secondary" onClick={resetDividendForm}>Cancel</button> : null}
          </div>
          {selectedDividendSecurity ? (
            <p className="hint">
              {dividendType === "cash"
                ? "Net dividend is gross minus tax."
                : dividendType === "bonus_issue"
                  ? "Bonus shares are distributed proportionally across current holders and do not change cash."
                  : "Warrant bonus creates separate warrant holdings based on current member ownership and does not change stock, fund, or cash balances."}
            </p>
          ) : null}
        </form>
      </section>

      <section className="grid two history-section">
        <HistoryTable
          title="Trade history"
          emptyMessage="No trades recorded yet."
          headers={["Date", "Counter", "Instrument", "Type", "Quantity", "Price", "Fees", "Allocation", "Notes", "Actions"]}
          isEmpty={filteredTrades.length === 0}
          controls={
            <div className="history-filters">
              <CounterFilter value={tradeHistoryCounter} onChange={setTradeHistoryCounter} securities={securities} />
              <label className="counter-filter">
                Instrument
                <select value={tradeHistoryInstrument} onChange={(event) => setTradeHistoryInstrument(event.target.value as typeof tradeHistoryInstrument)}>
                  <option value="all">All instruments</option>
                  <option value="stock">Stock</option>
                  <option value="warrant">Warrant</option>
                </select>
              </label>
            </div>
          }
        >
          {filteredTrades.map((trade) => {
            const security = securities.find((item) => item.id === trade.security_id);
            const instrumentLabel = trade.instrument_type === "warrant" ? `Warrant ${trade.warrant_code ?? ""}`.trim() : "Stock";
            return (
              <tr key={trade.id}>
                <td>{trade.trade_date}</td>
                <td>{security?.symbol ?? "Unknown"}</td>
                <td>{instrumentLabel}</td>
                <td className={trade.type === "buy" ? "" : "loss"}>{trade.type}</td>
                <td>{formatNumber(trade.quantity)}</td>
                <td>{formatMoney(trade.price, security?.currency)}</td>
                <td>{formatMoney(trade.fees, security?.currency)}</td>
                <td>{allocationSummary(trade.allocations, members, "quantity")}</td>
                <td>{trade.notes || "—"}</td>
                <td className="actions">
                  <button type="button" className="secondary small" onClick={() => editTrade(trade)}>Edit</button>
                  <button type="button" className="danger small" onClick={() => void deleteHistoryItem("trades", trade.id)}>Delete</button>
                </td>
              </tr>
            );
          })}
        </HistoryTable>

        <HistoryTable
          title="Dividend history"
          emptyMessage="No dividends recorded yet."
          headers={["Date", "Counter", "Type", "Gross", "Tax", "Net", "Allocation", "Notes", "Actions"]}
          isEmpty={filteredDividends.length === 0}
          controls={<CounterFilter value={dividendHistoryCounter} onChange={setDividendHistoryCounter} securities={securities} />}
        >
          {filteredDividends.map((dividend) => {
            const security = securities.find((item) => item.id === dividend.security_id);
            const isBonusIssue = dividend.type === "bonus_issue";
            const isWarrantBonus = dividend.type === "warrant_bonus";
            const net = isBonusIssue ? dividend.gross_amount : dividend.gross_amount - dividend.tax;
            const warrantDetails = isWarrantBonus
              ? [
                  dividend.warrant_code ? `Code: ${dividend.warrant_code}` : null,
                  dividend.bonus_ratio ? `Ratio: ${dividend.bonus_ratio}` : null,
                  dividend.warrant_quantity_received != null ? `Qty: ${formatNumber(dividend.warrant_quantity_received)}` : null,
                  dividend.exercise_price != null ? `Exercise: ${formatMoney(dividend.exercise_price, security?.currency, 4, 4)}` : null,
                  dividend.market_price != null ? `Market: ${formatMoney(dividend.market_price, security?.currency, 4, 4)}` : null,
                  dividend.expiry_date ? `Expiry: ${dividend.expiry_date}` : null
                ].filter(Boolean).join(" | ")
              : "";
            return (
              <tr key={dividend.id}>
                <td>{dividend.dividend_date}</td>
                <td>{security?.symbol ?? "Unknown"}</td>
                <td>{dividendTypeLabel(dividend.type)}</td>
                <td>{isBonusIssue || isWarrantBonus ? formatNumber(dividend.gross_amount) : formatMoney(dividend.gross_amount, security?.currency)}</td>
                <td>{isBonusIssue || isWarrantBonus ? "—" : formatMoney(dividend.tax, security?.currency)}</td>
                <td>{isBonusIssue || isWarrantBonus ? formatNumber(net) : formatMoney(net, security?.currency)}</td>
                <td>{isBonusIssue ? "Auto-applied proportionally" : isWarrantBonus ? "Auto-applied by ownership" : allocationSummary(dividend.allocations, members, "amount")}</td>
                <td>{[warrantDetails, dividend.notes].filter(Boolean).join(" — ") || "—"}</td>
                <td className="actions">
                  <button type="button" className="secondary small" onClick={() => editDividend(dividend)}>Edit</button>
                  <button type="button" className="danger small" onClick={() => void deleteHistoryItem("dividends", dividend.id)}>Delete</button>
                </td>
              </tr>
            );
          })}
        </HistoryTable>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>Stock counters</h2>
          <strong>Cash balance: {formatMoney(summary.cashBalance)}</strong>
        </div>
        <div className="counter-list">
          {summary.securitySummaries.map((row) => (
            <div className="counter" key={row.security.id}>
              <div>
                <strong>{row.security.symbol}</strong>
                <span>{row.security.name || row.security.currency}</span>
              </div>
              <label>
                Current price
                <input
                  inputMode="decimal"
                  defaultValue={row.security.current_price}
                  onBlur={(event) => updateSecurity(row.security, { current_price: numeric(event.target.value) })}
                />
              </label>
              <span>Weighted cost/unit: {formatMoney(row.costPricePerUnit, row.security.currency, 4, 4)}</span>
              <span>{formatNumber(row.quantity)} shares</span>
              <span>{formatMoney(row.marketValue, row.security.currency)}</span>
              <span className={tone(row.totalPnLIncludingDividends)}>
                {formatMoney(row.totalPnLIncludingDividends, row.security.currency)}
              </span>
              <button
                type="button"
                className={row.security.is_closed ? "secondary" : ""}
                onClick={() => updateSecurity(row.security, { is_closed: !row.security.is_closed })}
              >
                {row.security.is_closed ? "Reopen" : "Close"}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Warrant holdings</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Warrant Code</th>
                <th>Parent Stock</th>
                <th>Quantity Held</th>
                <th>Exercise Price</th>
                <th>Market Price</th>
                <th>Market Value</th>
                <th>Unrealized G/L</th>
                <th>Expiry Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {summary.warrantHoldings.length ? summary.warrantHoldings.map((row) => (
                <tr key={row.warrantCode}>
                  <td>{row.warrantCode}</td>
                  <td>{row.parentSecurity.symbol}</td>
                  <td>{formatNumber(row.quantityHeld)}</td>
                  <td>{formatMoney(row.exercisePrice, row.parentSecurity.currency, 4, 4)}</td>
                  <td>{row.marketPrice == null ? "—" : formatMoney(row.marketPrice, row.parentSecurity.currency, 4, 4)}</td>
                  <td>{row.marketValue == null ? "—" : formatMoney(row.marketValue, row.parentSecurity.currency)}</td>
                  <td className={row.unrealizedGainLoss == null ? "" : tone(row.unrealizedGainLoss)}>
                    {row.unrealizedGainLoss == null ? "—" : formatMoney(row.unrealizedGainLoss, row.parentSecurity.currency)}
                  </td>
                  <td>{row.expiryDate || "—"}</td>
                  <td>{row.status}</td>
                </tr>
              )) : (
                <tr><td colSpan={9} className="empty">No warrant holdings recorded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>Per-member positions</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Counter</th>
                <th>Member</th>
                <th>Qty</th>
                <th>Cost</th>
                <th>Value @ weighted cost</th>
                <th>Dividend</th>
                <th>P/L excl.</th>
                <th>P/L incl.</th>
              </tr>
            </thead>
            <tbody>
              {summary.memberPositions.map((position) => {
                const counter = summary.securitySummaries.find((item) => item.security.id === position.security.id);
                const valueAtWeightedCost = position.quantity * (counter?.costPricePerUnit ?? 0);
                return (
                  <tr key={`${position.security.id}:${position.member.id}`}>
                    <td>{position.security.symbol}</td>
                    <td>{position.member.name}</td>
                    <td>{formatNumber(position.quantity)}</td>
                    <td>{formatMoney(position.costBasis, position.security.currency)}</td>
                    <td>{formatMoney(valueAtWeightedCost, position.security.currency)}</td>
                    <td>{formatMoney(position.dividends, position.security.currency)}</td>
                    <td className={tone(position.totalPnLExcludingDividends)}>
                      {formatMoney(position.totalPnLExcludingDividends, position.security.currency)}
                    </td>
                    <td className={tone(position.totalPnLIncludingDividends)}>
                      {formatMoney(position.totalPnLIncludingDividends, position.security.currency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel cash-ledger">
        <div className="section-heading">
          <div>
            <h2>Cash ledger</h2>
            <p className="hint">Cash statement showing deposits, withdrawals, and trade cash movements.</p>
          </div>
          <strong>Balance: {formatMoney(summary.cashBalance)}</strong>
        </div>
        <div className="ledger-filters">
          <label>
            From
            <DateSelector value={ledgerStartDate} onChange={setLedgerStartDate} allowEmpty />
          </label>
          <label>
            To
            <DateSelector value={ledgerEndDate} onChange={setLedgerEndDate} allowEmpty />
          </label>
          <label>
            Transaction type
            <select value={ledgerType} onChange={(event) => setLedgerType(event.target.value as typeof ledgerType)}>
              <option value="all">All movements</option>
              <option value="deposit">Deposit</option>
              <option value="withdrawal">Withdrawal</option>
              <option value="buy">Buy trade</option>
              <option value="sell">Sell trade</option>
            </select>
          </label>
        </div>
        <div className="table-wrap">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Transaction type</th>
                <th>Description</th>
                <th>Created by</th>
                <th>Debit</th>
                <th>Credit</th>
                <th>Running balance</th>
              </tr>
            </thead>
            <tbody>
              {filteredCashLedger.length ? filteredCashLedger.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.date}</td>
                  <td className="capitalize">{entry.type === "buy" || entry.type === "sell" ? `${entry.type} trade` : entry.type}</td>
                  <td>{entry.description}</td>
                  <td>{entry.createdBy}</td>
                  <td>{entry.debit ? formatMoney(entry.debit) : "—"}</td>
                  <td>{entry.credit ? formatMoney(entry.credit) : "—"}</td>
                  <td className={tone(entry.runningBalance)}>{formatMoney(entry.runningBalance)}</td>
                </tr>
              )) : (
                <tr><td colSpan={7} className="empty">No cash movements match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function HistoryTable({
  title,
  headers,
  emptyMessage,
  isEmpty,
  controls,
  children
}: {
  title: string;
  headers: string[];
  emptyMessage: string;
  isEmpty: boolean;
  controls?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel history-panel">
      <div className="section-heading">
        <h2>{title}</h2>
        {controls}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
          </thead>
          <tbody>
            {isEmpty ? <tr><td colSpan={headers.length} className="empty">{emptyMessage}</td></tr> : children}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CounterFilter({
  value,
  onChange,
  securities
}: {
  value: string;
  onChange: (value: string) => void;
  securities: Security[];
}) {
  return (
    <label className="counter-filter">
      Counter
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="all">All counters</option>
        {securities.map((security) => <option key={security.id} value={security.id}>{security.symbol}</option>)}
      </select>
    </label>
  );
}

function dividendTypeLabel(type: Dividend["type"]) {
  if (type === "bonus_issue") return "Bonus issue";
  if (type === "warrant_bonus") return "Warrant bonus";
  return "Cash dividend";
}

function allocationSummary(
  allocations: Array<{ member_id: string; quantity?: number; amount?: number }>,
  members: Member[],
  field: "quantity" | "amount"
) {
  return allocations.map((allocation) => {
    const member = members.find((item) => item.id === allocation.member_id);
    return `${member?.name ?? "Unknown"}: ${formatNumber(allocation[field] ?? 0)}`;
  }).join(", ") || "—";
}

function DateSelector({
  value,
  onChange,
  allowEmpty = false
}: {
  value: string;
  onChange: (value: string) => void;
  allowEmpty?: boolean;
}) {
  const [yearValue, monthValue, dayValue] = value ? value.split("-").map(Number) : [];
  const currentYear = new Date().getFullYear();
  const year = Number.isFinite(yearValue) && yearValue > 0 ? yearValue : currentYear;
  const month = Number.isFinite(monthValue) && monthValue >= 1 && monthValue <= 12 ? monthValue : 1;
  const day = Number.isFinite(dayValue) && dayValue >= 1 ? dayValue : 1;
  const years = Array.from(new Set([year, ...Array.from({ length: 101 }, (_, index) => currentYear + 50 - index)])).sort((a, b) => b - a);
  const daysInMonth = new Date(year, month, 0).getDate();

  const updateDate = (nextYear: number, nextMonth: number, nextDay: number) => {
    const safeDay = Math.min(nextDay, new Date(nextYear, nextMonth, 0).getDate());
    onChange(`${nextYear}-${String(nextMonth).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`);
  };

  return (
    <div className="date-selector">
      <select
        aria-label="Day"
        value={value ? day : ""}
        onChange={(event) => event.target.value ? updateDate(year, month, Number(event.target.value)) : onChange("")}
      >
        {allowEmpty ? <option value="">Any date</option> : null}
        {Array.from({ length: daysInMonth }, (_, index) => index + 1).map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      <select aria-label="Month" value={month} onChange={(event) => updateDate(year, Number(event.target.value), day)}>
        {monthNames.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
      </select>
      <select aria-label="Year" value={year} onChange={(event) => updateDate(Number(event.target.value), month, day)}>
        {years.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </div>
  );
}

function AllocationInputs({
  members,
  values,
  setValues,
  label,
  onEvenSplit
}: {
  members: Member[];
  values: Record<string, string>;
  setValues: (next: Record<string, string>) => void;
  label: string;
  onEvenSplit: () => void;
}) {
  return (
    <div className="allocation">
      <div className="allocation-head">
        <span>{label}</span>
        <button type="button" className="secondary" onClick={onEvenSplit}>
          Split evenly
        </button>
      </div>
      {members.length ? (
        members.map((member) => (
          <label key={member.id}>
            {member.name}
            <input
              inputMode="decimal"
              value={values[member.id] ?? ""}
              onChange={(event) => setValues({ ...values, [member.id]: event.target.value })}
              placeholder="0"
            />
          </label>
        ))
      ) : (
        <p className="hint">Add members first.</p>
      )}
    </div>
  );
}

function tone(value: number) {
  if (value > 0) return "gain";
  if (value < 0) return "loss";
  return "";
}
