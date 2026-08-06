import { Hono } from 'hono';
import { handle } from 'hono/aws-lambda';
import { cors } from 'hono/cors';
import customers from './routes/customers';
import products from './routes/products';
import beds from './routes/beds';
import stock from './routes/stock';
import staff from './routes/staff';
import shifts from './routes/shifts';
import timesheets from './routes/timesheets';
import transactions from './routes/transactions';
import reports from './routes/reports';

const app = new Hono();

app.use('*', cors());

app.onError((err, c) => {
  console.error(err);
  const message = err instanceof Error ? err.message : 'Internal error';
  const status = (err as { status?: number }).status ?? 500;
  return c.json({ error: message }, status as 400 | 500);
});

app.route('/customers', customers);
app.route('/products', products);
app.route('/beds', beds);
app.route('/stock', stock);
app.route('/staff', staff);
app.route('/shifts', shifts);
app.route('/timesheets', timesheets);
app.route('/transactions', transactions);
app.route('/reports', reports);

app.get('/health', (c) => c.json({ ok: true }));

export const handler = handle(app);
