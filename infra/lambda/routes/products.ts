import { Hono } from 'hono';
import { query } from '../db';

const app = new Hono();

app.get('/', async (c) => {
  const rows = await query(
    `select id, name, category, price_pence as "pricePence", minutes, track_stock as "trackStock"
     from products
     where active
     order by category, name`,
  );
  return c.json(rows);
});

export default app;
