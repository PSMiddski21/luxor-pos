import { Hono } from 'hono';
import { query } from '../db';

const app = new Hono();

// GET /reports/summary?date=YYYY-MM-DD (defaults to today, server timezone)
app.get('/summary', async (c) => {
  const date = c.req.query('date') ?? new Date().toISOString().slice(0, 10);

  const [totals] = await query<{ cashPence: number; cardPence: number }>(
    `select coalesce(sum(cash_pence), 0) as "cashPence", coalesce(sum(card_pence), 0) as "cardPence"
     from transactions
     where occurred_at::date = :date::date`,
    { date },
  );

  const products = await query(
    `select p.name, sum(tl.quantity) as quantity, sum(tl.unit_price_pence * tl.quantity) as "revenuePence"
     from transaction_lines tl
     join transactions t on t.id = tl.transaction_id
     join products p on p.id = tl.product_id
     where t.occurred_at::date = :date::date
     group by p.name
     order by "revenuePence" desc`,
    { date },
  );

  return c.json({
    cashPence: totals?.cashPence ?? 0,
    cardPence: totals?.cardPence ?? 0,
    totalPence: (totals?.cashPence ?? 0) + (totals?.cardPence ?? 0),
    products,
  });
});

interface LogLineRow {
  id: string;
  occurredAt: string;
  customerId: string | null;
  customerName: string | null;
  bedId: string | null;
  bedLabel: string | null;
  cashPence: number;
  cardPence: number;
  totalPence: number;
  minutesBalanceAfter: number | null;
  productId: string | null;
  productName: string;
  quantity: number;
  unitPricePence: number;
  minutesApplied: number | null;
}

// GET /reports/log?date=YYYY-MM-DD (defaults to today) — every transaction
// that day, paid or costless, newest first, for the on-screen audit trail.
app.get('/log', async (c) => {
  const date = c.req.query('date') ?? new Date().toISOString().slice(0, 10);

  const rows = await query<LogLineRow>(
    `with day_tx as (
       select id from transactions where occurred_at::date = :date::date
     )
     select t.id, t.occurred_at as "occurredAt",
            t.customer_id as "customerId", cu.name as "customerName",
            t.bed_id as "bedId", b.label as "bedLabel",
            t.cash_pence as "cashPence", t.card_pence as "cardPence", t.total_pence as "totalPence",
            t.minutes_balance_after as "minutesBalanceAfter",
            tl.product_id as "productId", coalesce(p.name, 'Used minutes') as "productName",
            tl.quantity, tl.unit_price_pence as "unitPricePence", tl.minutes_applied as "minutesApplied"
     from transactions t
     join day_tx d on d.id = t.id
     left join customers cu on cu.id = t.customer_id
     left join beds b on b.id = t.bed_id
     join transaction_lines tl on tl.transaction_id = t.id
     left join products p on p.id = tl.product_id
     order by t.occurred_at desc`,
    { date },
  );

  interface LogLine {
    productId?: string;
    productName: string;
    quantity: number;
    unitPricePence: number;
    minutesApplied?: number;
  }
  interface LogEntry {
    id: string;
    occurredAt: string;
    customerId?: string;
    customerName?: string;
    bedId?: string;
    bedLabel?: string;
    cashPence: number;
    cardPence: number;
    totalPence: number;
    minutesBalanceAfter?: number;
    lines: LogLine[];
  }

  const byId = new Map<string, LogEntry>();
  for (const row of rows) {
    if (!byId.has(row.id)) {
      byId.set(row.id, {
        id: row.id,
        occurredAt: row.occurredAt,
        customerId: row.customerId ?? undefined,
        customerName: row.customerName ?? undefined,
        bedId: row.bedId ?? undefined,
        bedLabel: row.bedLabel ?? undefined,
        cashPence: row.cashPence,
        cardPence: row.cardPence,
        totalPence: row.totalPence,
        minutesBalanceAfter: row.minutesBalanceAfter ?? undefined,
        lines: [],
      });
    }
    byId.get(row.id)!.lines.push({
      productId: row.productId ?? undefined,
      productName: row.productName,
      quantity: row.quantity,
      unitPricePence: row.unitPricePence,
      minutesApplied: row.minutesApplied ?? undefined,
    });
  }

  return c.json(Array.from(byId.values()));
});

export default app;
