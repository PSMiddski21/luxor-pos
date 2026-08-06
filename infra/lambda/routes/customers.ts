import { Hono } from 'hono';
import { query } from '../db';

const app = new Hono();

app.get('/', async (c) => {
  const rows = await query(
    `select id, name, phone, minutes_balance as "minutesBalance", notes
     from customers
     order by name`,
  );
  return c.json(rows);
});

export default app;
