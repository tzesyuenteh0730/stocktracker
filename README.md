# Stock Pool Tracker

A simple Vercel + Supabase stock tracker for a shared pool account. It lets you:

- Add pool members, such as you and your dad.
- Add stock counters with manual current prices.
- Record buy and sell trades with per-member quantity allocation.
- Record dividends with per-member net allocation.
- See profit/loss with dividends included and excluded.
- Mark a stock counter closed once the pool has sold all shares.
- See how much every member is holding in the pool.

## Supabase setup

1. Create a Supabase project.
2. Open the SQL editor and run `supabase/schema.sql`.
3. Copy `.env.example` to `.env.local`.
4. Fill in:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

## Local run

```bash
npm install
npm run dev
```

## Vercel deploy

1. Push this repo to GitHub.
2. Import it in Vercel.
3. Add the two Supabase environment variables in Vercel project settings.
4. Deploy.

## Notes

This is a manual tracker. It does not connect to broker or stock-market APIs. Current prices are entered by hand so you control the numbers used for unrealized P/L.
