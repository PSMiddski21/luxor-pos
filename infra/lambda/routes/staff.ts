import { Hono } from 'hono';
import { query } from '../db';

const app = new Hono();

const STAFF_SELECT = `
  select id, name, role, pay_rate_pence as "payRatePence", active
  from staff
`;

app.get('/', async (c) => {
  const rows = await query(`${STAFF_SELECT} where active order by name`);
  return c.json(rows);
});

interface StaffBody {
  name: string;
  role: 'owner' | 'manager' | 'staff';
  payRatePence?: number;
  active?: boolean;
}

app.post('/', async (c) => {
  const body = await c.req.json<StaffBody>();
  if (!body.name?.trim()) return c.json({ error: 'Name is required' }, 400);
  if (!['owner', 'manager', 'staff'].includes(body.role)) {
    return c.json({ error: 'role must be owner, manager, or staff' }, 400);
  }

  const [row] = await query(
    `with inserted as (
       insert into staff (name, role, pay_rate_pence, active)
       values (:name, :role, :payRatePence, true)
       returning id
     )
     ${STAFF_SELECT} where id = (select id from inserted)`,
    {
      name: body.name.trim(),
      role: body.role,
      payRatePence: body.payRatePence ?? 0,
    },
  );
  return c.json(row, 201);
});

app.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<Partial<StaffBody>>();

  if (typeof body.name === 'string') {
    if (!body.name.trim()) return c.json({ error: 'Name is required' }, 400);
    await query(`update staff set name = :name where id = :id::uuid`, { id, name: body.name.trim() });
  }
  if (typeof body.role === 'string') {
    if (!['owner', 'manager', 'staff'].includes(body.role)) {
      return c.json({ error: 'role must be owner, manager, or staff' }, 400);
    }
    await query(`update staff set role = :role where id = :id::uuid`, { id, role: body.role });
  }
  if (typeof body.payRatePence === 'number') {
    await query(`update staff set pay_rate_pence = :payRatePence where id = :id::uuid`, {
      id,
      payRatePence: body.payRatePence,
    });
  }
  if (typeof body.active === 'boolean') {
    await query(`update staff set active = :active where id = :id::uuid`, { id, active: body.active });
  }

  const [row] = await query(`${STAFF_SELECT} where id = :id::uuid`, { id });
  return c.json(row);
});

export default app;
