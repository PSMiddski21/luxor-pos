import { Hono } from 'hono';
import { query } from '../db';

const app = new Hono();

app.get('/', async (c) => {
  const rows = await query(
    `select id, name, role, pay_rate_pence as "payRatePence", active
     from staff
     where active
     order by name`,
  );
  return c.json(rows);
});

export default app;
