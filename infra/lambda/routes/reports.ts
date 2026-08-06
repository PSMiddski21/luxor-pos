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

export default app;
