import { Hono } from 'hono';
import { query } from '../db';

const app = new Hono();

const PRODUCT_SELECT = `
  select id, name, category, price_pence as "pricePence",
         cost_price_pence as "costPricePence", minutes, track_stock as "trackStock", active
  from products
`;

app.get('/', async (c) => {
  const rows = await query(`${PRODUCT_SELECT} where active order by category, name`);
  return c.json(rows);
});

interface CreateTanningBody {
  name: string;
  pricePence: number;
  minutes: number;
}

// Tanning-minutes packages (e.g. "10 min tan") — no stock to track, unlike
// retail items which go through POST /stock instead (that also creates the
// stock_items row a retail product needs).
app.post('/', async (c) => {
  const body = await c.req.json<CreateTanningBody>();
  if (!body.name?.trim()) return c.json({ error: 'Name is required' }, 400);
  if (typeof body.pricePence !== 'number' || body.pricePence < 0) {
    return c.json({ error: 'Price must be a non-negative number' }, 400);
  }
  if (!Number.isInteger(body.minutes) || body.minutes <= 0) {
    return c.json({ error: 'Minutes must be a positive whole number' }, 400);
  }

  let productId: string;
  try {
    const [row] = await query<{ id: string }>(
      `insert into products (name, category, price_pence, minutes, track_stock)
       values (:name, 'tanning_minutes', :pricePence, :minutes, false)
       returning id`,
      { name: body.name.trim(), pricePence: body.pricePence, minutes: body.minutes },
    );
    productId = row.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not create product';
    const status = message.includes('unique') ? 409 : 400;
    return c.json({ error: status === 409 ? `A product named "${body.name}" already exists` : message }, status);
  }

  const [row] = await query(`${PRODUCT_SELECT} where id = :id::uuid`, { id: productId });
  return c.json(row, 201);
});

interface PatchBody {
  name?: string;
  pricePence?: number;
  minutes?: number;
  costPricePence?: number | null;
  active?: boolean;
}

app.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<PatchBody>();

  if (typeof body.name === 'string') {
    if (!body.name.trim()) return c.json({ error: 'Name is required' }, 400);
    await query(`update products set name = :name where id = :id::uuid`, { id, name: body.name.trim() });
  }
  if (typeof body.pricePence === 'number') {
    if (body.pricePence < 0) return c.json({ error: 'Price must be a non-negative number' }, 400);
    await query(`update products set price_pence = :pricePence where id = :id::uuid`, {
      id,
      pricePence: body.pricePence,
    });
  }
  if (typeof body.minutes === 'number') {
    if (!Number.isInteger(body.minutes) || body.minutes <= 0) {
      return c.json({ error: 'Minutes must be a positive whole number' }, 400);
    }
    await query(`update products set minutes = :minutes where id = :id::uuid`, { id, minutes: body.minutes });
  }
  if ('costPricePence' in body) {
    if (body.costPricePence !== null && (typeof body.costPricePence !== 'number' || body.costPricePence < 0)) {
      return c.json({ error: 'costPricePence must be a non-negative number or null' }, 400);
    }
    await query(`update products set cost_price_pence = :costPricePence where id = :id::uuid`, {
      id,
      costPricePence: body.costPricePence,
    });
  }
  if (typeof body.active === 'boolean') {
    await query(`update products set active = :active where id = :id::uuid`, { id, active: body.active });
  }

  const [row] = await query(`${PRODUCT_SELECT} where id = :id::uuid`, { id });
  return c.json(row);
});

export default app;
