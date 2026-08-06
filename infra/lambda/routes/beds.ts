import { Hono } from 'hono';
import { query } from '../db';

const app = new Hono();

app.get('/', async (c) => {
  const rows = await query(`select id, label, status from beds order by label`);
  return c.json(rows);
});

export default app;
