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
  let sessionMinutes = 0;
  for (const line of body.lines) {
    const [product] = await query<{ pricePence: number; category: string; minutes: number | null }>(
      `select price_pence as "pricePence", category, minutes from products where id = :productId::uuid`,
      { productId: line.productId },
    );
    if (!product) return c.json({ error: `Unknown product ${line.productId}` }, 400);
    totalPence += product.pricePence * line.quantity;
    if (product.category === 'tanning_minutes' && product.minutes) {
      sessionMinutes += product.minutes * line.quantity;
    }
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

    if (body.customerId) {
      await query(
        `update transactions set minutes_balance_after = (select minutes_balance from customers where id = :customerId::uuid)
         where id = :id::uuid`,
        { id: txRow.id, customerId: body.customerId },
        { transactionId: txId },
      );
    }

    // A tanning-minutes purchase with a bed attached means the customer is
    // starting that session now — occupy the bed for its length. Auto-clears
    // via GET /beds' lazy expiry (see routes/beds.ts), no cron needed.
    if (body.bedId && sessionMinutes > 0) {
      await query(
        `update beds set status = 'in_use', busy_until = now() + (:sessionMinutes * interval '1 minute')
         where id = :bedId::uuid`,
        { bedId: body.bedId, sessionMinutes },
        { transactionId: txId },
      );
    }

    return txRow.id;
  });

  const [transaction] = await query(
    `select id, occurred_at as "occurredAt", customer_id as "customerId", bed_id as "bedId",
            cash_pence as "cashPence", card_pence as "cardPence", total_pence as "totalPence",
            minutes_balance_after as "minutesBalanceAfter"
     from transactions where id = :id::uuid`,
    { id: transactionId },
  );
  const lines = await query(
    `select tl.product_id as "productId", p.name as "productName", tl.quantity,
            tl.unit_price_pence as "unitPricePence", tl.minutes_applied as "minutesApplied"
     from transaction_lines tl
     join products p on p.id = tl.product_id
     where tl.transaction_id = :id::uuid`,
    { id: transactionId },
  );

  return c.json({ ...transaction, lines }, 201);
});

interface UseMinutesBody extends Record<string, string | number> {
  customerId: string;
  bedId: string;
  minutes: number;
}

// Logs a bed session against a customer's existing prepaid minutes. No
// payment is taken, but it's still committed as a real (zero-value)
// transaction — balance debit, transaction row, and line all happen inside
// one transaction, so a customer with insufficient minutes gets no orphaned
// record and every session is auditable in the same place as paid sales.
app.post('/use-minutes', async (c) => {
  const body = await c.req.json<UseMinutesBody>();

  let transactionId: string;
  try {
    transactionId = await withTransaction(async (txId) => {
      const [txRow] = await query<{ id: string }>(
        `insert into transactions (customer_id, bed_id, cash_pence, card_pence, total_pence, notes)
         values (:customerId::uuid, :bedId::uuid, 0, 0, 0, 'Used prepaid minutes')
         returning id`,
        { customerId: body.customerId, bedId: body.bedId },
        { transactionId: txId },
      );

      await query(
        `select use_minutes(:customerId::uuid, :bedId::uuid, :minutes::integer)`,
        body,
        { transactionId: txId },
      );

      await query(
        `insert into transaction_lines (transaction_id, product_id, quantity, unit_price_pence, minutes_applied)
         values (:transactionId::uuid, null, 1, 0, :minutesApplied)`,
        { transactionId: txRow.id, minutesApplied: -Number(body.minutes) },
        { transactionId: txId },
      );

      await query(
        `update transactions set minutes_balance_after = (select minutes_balance from customers where id = :customerId::uuid)
         where id = :id::uuid`,
        { id: txRow.id, customerId: body.customerId },
        { transactionId: txId },
      );

      // Occupy the bed for the logged session length; auto-clears via
      // GET /beds' lazy expiry (see routes/beds.ts).
      await query(
        `update beds set status = 'in_use', busy_until = now() + (:minutes * interval '1 minute')
         where id = :bedId::uuid`,
        { bedId: body.bedId, minutes: Number(body.minutes) },
        { transactionId: txId },
      );

      return txRow.id;
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not log session';
    return c.json({ error: message }, 400);
  }

  const [transaction] = await query(
    `select id, occurred_at as "occurredAt", customer_id as "customerId", bed_id as "bedId",
            cash_pence as "cashPence", card_pence as "cardPence", total_pence as "totalPence",
            minutes_balance_after as "minutesBalanceAfter"
     from transactions where id = :id::uuid`,
    { id: transactionId },
  );
  const lines = await query(
    `select tl.product_id as "productId", coalesce(p.name, 'Used minutes') as "productName",
            tl.quantity, tl.unit_price_pence as "unitPricePence", tl.minutes_applied as "minutesApplied"
     from transaction_lines tl
     left join products p on p.id = tl.product_id
     where tl.transaction_id = :id::uuid`,
    { id: transactionId },
  );

  return c.json({ ...transaction, lines }, 201);
});

export default app;
