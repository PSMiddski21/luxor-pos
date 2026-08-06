import { Hono } from 'hono';
import { query, withTransaction } from '../db';

const app = new Hono();

interface CheckoutLine {
  productId: string;
  quantity: number;
}

interface CheckoutBody {
  customerId?: string;
  bedId?: string;
  cashPence: number;
  cardPence: number;
  lines: CheckoutLine[];
}

app.post('/', async (c) => {
  const body = await c.req.json<CheckoutBody>();
  if (!body.lines?.length) return c.json({ error: 'Cart is empty' }, 400);

  // Price authoritatively from the DB, never trust client-submitted totals.
  let totalPence = 0;
  for (const line of body.lines) {
    const [product] = await query<{ pricePence: number }>(
      `select price_pence as "pricePence" from products where id = :productId`,
      { productId: line.productId },
    );
    if (!product) return c.json({ error: `Unknown product ${line.productId}` }, 400);
    totalPence += product.pricePence * line.quantity;
  }

  const transactionId = await withTransaction(async (txId) => {
    const [txRow] = await query<{ id: string }>(
      `insert into transactions (customer_id, bed_id, cash_pence, card_pence, total_pence)
       values (:customerId::uuid, :bedId::uuid, :cashPence, :cardPence, :totalPence)
       returning id`,
      {
        customerId: body.customerId ?? null,
        bedId: body.bedId ?? null,
        cashPence: body.cashPence,
        cardPence: body.cardPence,
        totalPence,
      },
      { transactionId: txId },
    );

    for (const line of body.lines) {
      await query(
        `select sell_product(:transactionId::uuid, :productId::uuid, :quantity::integer, :customerId::uuid)`,
        {
          transactionId: txRow.id,
          productId: line.productId,
          quantity: line.quantity,
          customerId: body.customerId ?? null,
        },
        { transactionId: txId },
      );
    }

    return txRow.id;
  });

  const [transaction] = await query(
    `select id, occurred_at as "occurredAt", customer_id as "customerId", bed_id as "bedId",
            cash_pence as "cashPence", card_pence as "cardPence", total_pence as "totalPence"
     from transactions where id = :id`,
    { id: transactionId },
  );
  const lines = await query(
    `select tl.product_id as "productId", p.name as "productName", tl.quantity,
            tl.unit_price_pence as "unitPricePence", tl.minutes_applied as "minutesApplied"
     from transaction_lines tl
     join products p on p.id = tl.product_id
     where tl.transaction_id = :id`,
    { id: transactionId },
  );

  return c.json({ ...transaction, lines }, 201);
});

interface UseMinutesBody extends Record<string, string | number> {
  customerId: string;
  bedId: string;
  minutes: number;
}

app.post('/use-minutes', async (c) => {
  const body = await c.req.json<UseMinutesBody>();
  try {
    await query(`select use_minutes(:customerId::uuid, :bedId::uuid, :minutes::integer)`, body);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not log session';
    return c.json({ error: message }, 400);
  }
  return c.body(null, 204);
});

export default app;
