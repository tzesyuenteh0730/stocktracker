"use client";

import { FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { buildPortfolioSummary, formatMoney, formatNumber } from "@/lib/calculations";
import { hasSupabaseConfig, supabase } from "@/lib/supabase";
import type { Dividend, DividendAllocation, Member, Security, Trade } from "@/lib/types";

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
  quantity: numeric(row.quantity),
  price: numeric(row.price),
  fees: numeric(row.fees),
  allocations: row.allocations ?? [],
  notes: row.notes ?? null
});

const normalizeDividend = (row: Dividend): Dividend => ({
  ...row,
  gross_amount: numeric(row.gross_amount),
  tax: numeric(row.tax),
  allocations: row.allocations ?? [],
  notes: row.notes ?? null
});

export default function Home() {
  const [members, setMembers] = useState<Member[]>([]);
  const [securities, setSecurities] = useState<Security[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [dividends, setDividends] = useState<Dividend[]>([]);
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

  const [dividendSecurityId, setDividendSecurityId] = useState("");
  const [dividendDate, setDividendDate] = useState(today);
  const [grossDividend, setGrossDividend] = useState("");
  const [dividendTax, setDividendTax] = useState("");
  const [dividendNotes, setDividendNotes] = useState("");
  const [dividendAllocations, setDividendAllocations] = useState<Record<string, string>>({});
  const [editingDividendId, setEditingDividendId] = useState<string | null>(null);

  const summary = useMemo(
    () => buildPortfolioSummary(members, securities, trades, dividends),
    [members, securities, trades, dividends]
  );

  const selectedTradeSecurity = securities.find((security) => security.id === tradeSecurityId);
  const selectedDividendSecurity = securities.find((security) => security.id === dividendSecurityId);

  async function loadData() {
    if (!supabase) return;
    setLoadState("loading");
    setMessage("");

    const [membersResult, securitiesResult, tradesResult, dividendsResult] = await Promise.all([
      supabase.from("members").select("*").order("created_at", { ascending: true }),
      supabase.from("securities").select("*").order("symbol", { ascending: true }),
      supabase.from("trades").select("*").order("trade_date", { ascending: false }),
      supabase.from("dividends").select("*").order("dividend_date", { ascending: false })
    ]);

    const error = membersResult.error ?? securitiesResult.error ?? tradesResult.error ?? dividendsResult.error;
    if (error) {
      setLoadState("error");
      setMessage(error.message);
      return;
    }

    setMembers((membersResult.data ?? []).map(normalizeMember));
    setSecurities((securitiesResult.data ?? []).map(normalizeSecurity));
    setTrades((tradesResult.data ?? []).map(normalizeTrade));
    setDividends((dividendsResult.data ?? []).map(normalizeDividend));
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

    if (error) return setMessage(error.message);
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

    if (error) return setMessage(error.message);
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

  function splitDividendEvenly() {
    if (!members.length) return;
    const net = numeric(grossDividend) - numeric(dividendTax);
    const share = net / members.length;
    setDividendAllocations(Object.fromEntries(members.map((member) => [member.id, String(share)])));
  }

  function resetTradeForm() {
    setEditingTradeId(null);
    setTradeSecurityId("");
    setTradeDate(today);
    setTradeType("buy");
    setTradeQuantity("");
    setTradePrice("");
    setTradeFees("");
    setTradeNotes("");
    setTradeAllocations({});
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
      : await supabase.from("trades").insert(trade);

    if (error) return setMessage(error.message);
    resetTradeForm();
    await loadData();
  }

  function resetDividendForm() {
    setEditingDividendId(null);
    setDividendSecurityId("");
    setDividendDate(today);
    setGrossDividend("");
    setDividendTax("");
    setDividendNotes("");
    setDividendAllocations({});
  }

  async function saveDividend(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !dividendSecurityId) return;

    const netDividend = numeric(grossDividend) - numeric(dividendTax);
    const allocations: DividendAllocation[] = Object.entries(dividendAllocations)
      .map(([member_id, value]) => ({ member_id, amount: numeric(value) }))
      .filter((allocation) => allocation.amount !== 0);
    const allocatedAmount = allocations.reduce((sum, allocation) => sum + allocation.amount, 0);

    if (Math.abs(allocatedAmount - netDividend) > 0.01) {
      setMessage("Dividend allocation must add up to the net dividend after tax.");
      return;
    }

    const dividend = {
      security_id: dividendSecurityId,
      dividend_date: dividendDate,
      gross_amount: numeric(grossDividend),
      tax: numeric(dividendTax),
      allocations,
      notes: dividendNotes.trim() || null
    };
    const { error } = editingDividendId
      ? await supabase.from("dividends").update(dividend).eq("id", editingDividendId)
      : await supabase.from("dividends").insert(dividend);

    if (error) return setMessage(error.message);
    resetDividendForm();
    await loadData();
  }

  function editTrade(trade: Trade) {
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
    setGrossDividend(String(dividend.gross_amount));
    setDividendTax(String(dividend.tax));
    setDividendNotes(dividend.notes ?? "");
    setDividendAllocations(Object.fromEntries(dividend.allocations.map((item) => [item.member_id, String(item.amount)])));
  }

  async function deleteHistoryItem(table: "trades" | "dividends", id: string) {
    if (!supabase || !window.confirm("Delete this record? This cannot be undone.")) return;
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) return setMessage(error.message);
    if (table === "trades" && editingTradeId === id) resetTradeForm();
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
        <Metric label="Pool holding" value={formatMoney(summary.poolTotals.marketValue)} />
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
        <form className="panel" onSubmit={saveTrade}>
          <h2>{editingTradeId ? "Edit trade" : "Add trade"}</h2>
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
            <button type="submit">{editingTradeId ? "Update trade" : "Save trade"}</button>
            {editingTradeId ? <button type="button" className="secondary" onClick={resetTradeForm}>Cancel</button> : null}
          </div>
          {selectedTradeSecurity ? <p className="hint">Using {selectedTradeSecurity.currency} for this counter.</p> : null}
        </form>

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
              Date
              <DateSelector value={dividendDate} onChange={setDividendDate} />
            </label>
          </div>
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
          <AllocationInputs
            members={members}
            values={dividendAllocations}
            setValues={setDividendAllocations}
            label="Member net amount"
            onEvenSplit={splitDividendEvenly}
          />
          <label>
            Notes
            <input value={dividendNotes} onChange={(event) => setDividendNotes(event.target.value)} placeholder="Optional" />
          </label>
          <div className="form-actions">
            <button type="submit">{editingDividendId ? "Update dividend" : "Save dividend"}</button>
            {editingDividendId ? <button type="button" className="secondary" onClick={resetDividendForm}>Cancel</button> : null}
          </div>
          {selectedDividendSecurity ? <p className="hint">Net dividend is gross minus tax.</p> : null}
        </form>
      </section>

      <section className="grid two history-section">
        <HistoryTable
          title="Trade history"
          emptyMessage="No trades recorded yet."
          headers={["Date", "Counter", "Type", "Quantity", "Price", "Fees", "Allocation", "Notes", "Actions"]}
          isEmpty={trades.length === 0}
        >
          {trades.map((trade) => {
            const security = securities.find((item) => item.id === trade.security_id);
            return (
              <tr key={trade.id}>
                <td>{trade.trade_date}</td>
                <td>{security?.symbol ?? "Unknown"}</td>
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
          headers={["Date", "Counter", "Gross", "Tax", "Net", "Allocation", "Notes", "Actions"]}
          isEmpty={dividends.length === 0}
        >
          {dividends.map((dividend) => {
            const security = securities.find((item) => item.id === dividend.security_id);
            const net = dividend.gross_amount - dividend.tax;
            return (
              <tr key={dividend.id}>
                <td>{dividend.dividend_date}</td>
                <td>{security?.symbol ?? "Unknown"}</td>
                <td>{formatMoney(dividend.gross_amount, security?.currency)}</td>
                <td>{formatMoney(dividend.tax, security?.currency)}</td>
                <td>{formatMoney(net, security?.currency)}</td>
                <td>{allocationSummary(dividend.allocations, members, "amount")}</td>
                <td>{dividend.notes || "—"}</td>
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
        <h2>Stock counters</h2>
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
        <h2>Per-member positions</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Counter</th>
                <th>Member</th>
                <th>Qty</th>
                <th>Cost</th>
                <th>Value</th>
                <th>Dividend</th>
                <th>P/L excl.</th>
                <th>P/L incl.</th>
              </tr>
            </thead>
            <tbody>
              {summary.memberPositions.map((position) => (
                <tr key={`${position.security.id}:${position.member.id}`}>
                  <td>{position.security.symbol}</td>
                  <td>{position.member.name}</td>
                  <td>{formatNumber(position.quantity)}</td>
                  <td>{formatMoney(position.costBasis, position.security.currency)}</td>
                  <td>{formatMoney(position.marketValue, position.security.currency)}</td>
                  <td>{formatMoney(position.dividends, position.security.currency)}</td>
                  <td className={tone(position.totalPnLExcludingDividends)}>
                    {formatMoney(position.totalPnLExcludingDividends, position.security.currency)}
                  </td>
                  <td className={tone(position.totalPnLIncludingDividends)}>
                    {formatMoney(position.totalPnLIncludingDividends, position.security.currency)}
                  </td>
                </tr>
              ))}
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
  children
}: {
  title: string;
  headers: string[];
  emptyMessage: string;
  isEmpty: boolean;
  children: ReactNode;
}) {
  return (
    <section className="panel history-panel">
      <h2>{title}</h2>
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

function DateSelector({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [yearValue, monthValue, dayValue] = value.split("-").map(Number);
  const currentYear = new Date().getFullYear();
  const year = Number.isFinite(yearValue) ? yearValue : currentYear;
  const month = Number.isFinite(monthValue) ? monthValue : 1;
  const day = Number.isFinite(dayValue) ? dayValue : 1;
  const years = Array.from(new Set([year, ...Array.from({ length: 22 }, (_, index) => currentYear + 1 - index)])).sort((a, b) => b - a);
  const daysInMonth = new Date(year, month, 0).getDate();

  const updateDate = (nextYear: number, nextMonth: number, nextDay: number) => {
    const safeDay = Math.min(nextDay, new Date(nextYear, nextMonth, 0).getDate());
    onChange(`${nextYear}-${String(nextMonth).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`);
  };

  return (
    <div className="date-selector">
      <select aria-label="Day" value={day} onChange={(event) => updateDate(year, month, Number(event.target.value))}>
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
