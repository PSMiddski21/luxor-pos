import { Hono } from 'hono';
import { query, withTransaction } from '../db';

const app = new Hono();

const CUSTOMER_SELECT = `
  select id, name, phone, email, minutes_balance as "minutesBalance", notes,
         terms_accepted as "termsAccepted", active
  from customers
`;

app.get('/', async (c) => {
  const rows = await query(`${CUSTOMER_SELECT} where active order by name`);
  return c.json(rows);
});

interface CustomerBody {
  name: string;
  phone?: string;
  email?: string;
  minutesBalance?: number;
  notes?: string;
  termsAccepted?: boolean;
  active?: boolean;
}

app.post('/', async (c) => {
  const body = await c.req.json<CustomerBody>();
  // Two statements, not a data-modifying CTE followed by a SELECT off it —
  // RDS Data API silently returns zero records for that shape even though
  // the insert itself commits fine.
  const [inserted] = await query<{ id: string }>(
    `insert into customers (name, phone, email, minutes_balance, notes, terms_accepted)
     values (:name, :phone, :email, :minutesBalance, :notes, :termsAccepted)
     returning id`,
    {
      name: body.name,
      phone: body.phone ?? null,
      email: body.email ?? null,
      minutesBalance: body.minutesBalance ?? 0,
      notes: body.notes ?? null,
      termsAccepted: body.termsAccepted ?? false,
    },
  );
  const [row] = await query(`${CUSTOMER_SELECT} where id = :id::uuid`, { id: inserted.id });
  return c.json(row, 201);
});

app.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<Partial<CustomerBody>>();

  if (typeof body.name === 'string') {
    await query(`update customers set name = :name where id = :id::uuid`, { id, name: body.name });
  }
  if ('phone' in body) {
    await query(`update customers set phone = :phone where id = :id::uuid`, { id, phone: body.phone ?? null });
  }
  if ('email' in body) {
    await query(`update customers set email = :email where id = :id::uuid`, { id, email: body.email ?? null });
  }
  if (typeof body.minutesBalance === 'number') {
    await query(`update customers set minutes_balance = :minutesBalance where id = :id::uuid`, {
      id,
      minutesBalance: body.minutesBalance,
    });
  }
  if ('notes' in body) {
    await query(`update customers set notes = :notes where id = :id::uuid`, { id, notes: body.notes ?? null });
  }
  if (typeof body.termsAccepted === 'boolean') {
    await query(`update customers set terms_accepted = :termsAccepted where id = :id::uuid`, {
      id,
      termsAccepted: body.termsAccepted,
    });
  }
  if (typeof body.active === 'boolean') {
    await query(`update customers set active = :active where id = :id::uuid`, { id, active: body.active });
  }

  const [row] = await query(`${CUSTOMER_SELECT} where id = :id::uuid`, { id });
  return c.json(row);
});

type ImportRow = CustomerBody;

interface ImportRowResult {
  row: number;
  name: string;
  action: 'created' | 'updated' | 'error';
  error?: string;
}

// Bulk import from the in-app CSV upload (Customers page). Matches existing
// customers by case-insensitive exact name and updates them; anything new is
// inserted. Runs inside one transaction so a bad row can't leave the import
// half-applied, same principle as infra/scripts/import-data.mjs.
app.post('/import', async (c) => {
  const body = await c.req.json<{ rows: ImportRow[] }>();
  const results: ImportRowResult[] = [];

  await withTransaction(async (transactionId) => {
    for (const [i, r] of body.rows.entries()) {
      if (!r.name || !r.name.trim()) {
        results.push({ row: i + 1, name: r.name ?? '', action: 'error', error: 'Missing name' });
        continue;
      }

      const [existing] = await query<{ id: string }>(
        `select id from customers where lower(name) = lower(:name)`,
        { name: r.name.trim() },
        { transactionId },
      );

      if (existing) {
        await query(
          `update customers set
             phone = coalesce(:phone, phone),
             email = coalesce(:email, email),
             minutes_balance = coalesce(:minutesBalance, minutes_balance),
             notes = coalesce(:notes, notes)
           where id = :id::uuid`,
          {
            id: existing.id,
            phone: r.phone ?? null,
            email: r.email ?? null,
            minutesBalance: r.minutesBalance ?? null,
            notes: r.notes ?? null,
          },
          { transactionId },
        );
        results.push({ row: i + 1, name: r.name.trim(), action: 'updated' });
      } else {
        await query(
          `insert into customers (name, phone, email, minutes_balance, notes)
           values (:name, :phone, :email, :minutesBalance, :notes)`,
          {
            name: r.name.trim(),
            phone: r.phone ?? null,
            email: r.email ?? null,
            minutesBalance: r.minutesBalance ?? 0,
            notes: r.notes ?? null,
          },
          { transactionId },
        );
        results.push({ row: i + 1, name: r.name.trim(), action: 'created' });
      }
    }
  });

  const customers = await query(`${CUSTOMER_SELECT} where active order by name`);
  return c.json({ customers, results });
});

export default app;
