import { Hono } from 'hono';
import { query } from '../db';

const app = new Hono();

const PRODUCT_SELECT = `
  select id, name, category, price_pence as "pricePence",
         cost_price_pence as "costPricePence", minutes, track_stock as "trackStock"
  from products
`;

app.get('/', async (c) => {
  const rows = await query(`${PRODUCT_SELECT} where active order by category, name`);
  return c.json(rows);
});

interface PatchBody {
  costPricePence?: number | null;
}

app.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<PatchBody>();

  if ('costPricePence' in body) {
    if (body.costPricePence !== null && (typeof body.costPricePence !== 'number' || body.costPricePence < 0)) {
      return c.json({ error: 'costPricePence must be a non-negative number or null' }, 400);
    }
    await query(`update products set cost_price_pence = :costPricePence where id = :id`, {
      id,
      costPricePence: body.costPricePence,
    });
  }

  const [row] = await query(`${PRODUCT_SELECT} where id = :id`, { id });
  return c.json(row);
});

export default app;
