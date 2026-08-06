import { Hono } from 'hono';
import { query } from '../db';

const app = new Hono();

app.get('/', async (c) => {
  const rows = await query(
    `select product_id as "productId", quantity_on_hand as "quantityOnHand",
            reorder_level as "reorderLevel", supplier
     from stock_items
     order by product_id`,
  );
  return c.json(rows);
});

interface PatchBody {
  delta?: number;
  quantityOnHand?: number;
  reorderLevel?: number;
}

app.patch('/:productId', async (c) => {
  const productId = c.req.param('productId');
  const body = await c.req.json<PatchBody>();

  if (typeof body.delta === 'number') {
    await query(
      `update stock_items
       set quantity_on_hand = greatest(0, quantity_on_hand + :delta), updated_at = now()
       where product_id = :productId`,
      { productId, delta: body.delta },
    );
  }
  if (typeof body.quantityOnHand === 'number') {
    await query(
      `update stock_items set quantity_on_hand = :qty, updated_at = now() where product_id = :productId`,
      { productId, qty: Math.max(0, body.quantityOnHand) },
    );
  }
  if (typeof body.reorderLevel === 'number') {
    await query(
      `update stock_items set reorder_level = :level, updated_at = now() where product_id = :productId`,
      { productId, level: Math.max(0, body.reorderLevel) },
    );
  }

  const [row] = await query(
    `select product_id as "productId", quantity_on_hand as "quantityOnHand",
            reorder_level as "reorderLevel", supplier
     from stock_items where product_id = :productId`,
    { productId },
  );
  return c.json(row);
});

export default app;
