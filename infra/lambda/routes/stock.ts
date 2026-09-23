import { Hono } from 'hono';
import { query, withTransaction } from '../db';

const app = new Hono();

const STOCK_SELECT = `
  select product_id as "productId", quantity_on_hand as "quantityOnHand",
         reorder_level as "reorderLevel", supplier
  from stock_items
`;

app.get('/', async (c) => {
  const rows = await query(`${STOCK_SELECT} order by product_id`);
  return c.json(rows);
});

interface CreateStockBody {
  name: string;
  pricePence: number;
  costPricePence?: number;
  quantityOnHand?: number;
  reorderLevel?: number;
  supplier?: string;
}

// Adds a new retail item from the Stock page: creates the product and its
// stock row together (a stock_items row makes no sense without a product,
// and a trackStock retail product makes no sense without one), atomically.
app.post('/', async (c) => {
  const body = await c.req.json<CreateStockBody>();
  if (!body.name?.trim()) return c.json({ error: 'Name is required' }, 400);
  if (typeof body.pricePence !== 'number' || body.pricePence < 0) {
    return c.json({ error: 'Price must be a non-negative number' }, 400);
  }

  let productId: string;
  try {
    productId = await withTransaction(async (transactionId) => {
      const [product] = await query<{ id: string }>(
        `insert into products (name, category, price_pence, cost_price_pence, track_stock)
         values (:name, 'retail', :pricePence, :costPricePence, true)
         returning id`,
        {
          name: body.name.trim(),
          pricePence: body.pricePence,
          costPricePence: body.costPricePence ?? null,
        },
        { transactionId },
      );

      await query(
        `insert into stock_items (product_id, quantity_on_hand, reorder_level, supplier)
         values (:productId::uuid, :quantityOnHand, :reorderLevel, :supplier)`,
        {
          productId: product.id,
          quantityOnHand: body.quantityOnHand ?? 0,
          reorderLevel: body.reorderLevel ?? 0,
          supplier: body.supplier ?? null,
        },
        { transactionId },
      );

      return product.id;
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not create item';
    const status = message.includes('unique') ? 409 : 400;
    return c.json({ error: status === 409 ? `An item named "${body.name}" already exists` : message }, status);
  }

  const [product] = await query(
    `select id, name, category, price_pence as "pricePence",
            cost_price_pence as "costPricePence", minutes, track_stock as "trackStock"
     from products where id = :id`,
    { id: productId },
  );
  const [stockItem] = await query(`${STOCK_SELECT} where product_id = :id`, { id: productId });

  return c.json({ product, stockItem }, 201);
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

  const [row] = await query(`${STOCK_SELECT} where product_id = :productId`, { productId });
  return c.json(row);
});

export default app;
