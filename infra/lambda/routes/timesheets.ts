import { Hono } from 'hono';
import { query } from '../db';

const app = new Hono();

const TIMESHEET_SELECT = `
  select id, staff_id as "staffId", shift_id as "shiftId",
         to_char(clock_in at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "clockIn",
         to_char(clock_out at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "clockOut"
  from timesheets
`;

app.get('/', async (c) => {
  const rows = await query(`${TIMESHEET_SELECT} order by clock_in desc`);
  return c.json(rows);
});

app.post('/clock-in', async (c) => {
  const body = await c.req.json<{ staffId: string; shiftId?: string }>();

  const alreadyIn = await query(
    `select id from timesheets where staff_id = :staffId::uuid and clock_out is null`,
    { staffId: body.staffId },
  );
  if (alreadyIn.length > 0) {
    return c.json({ error: 'Staff member is already clocked in' }, 409);
  }

  // Two statements, not a data-modifying CTE followed by a SELECT off it —
  // RDS Data API silently returns zero records for that shape even though
  // the insert itself commits fine.
  const [inserted] = await query<{ id: string }>(
    `insert into timesheets (staff_id, shift_id, clock_in)
     values (:staffId::uuid, :shiftId::uuid, now())
     returning id`,
    { staffId: body.staffId, shiftId: body.shiftId ?? null },
  );
  const [row] = await query(`${TIMESHEET_SELECT} where id = :id::uuid`, { id: inserted.id });
  return c.json(row, 201);
});

app.post('/:id/clock-out', async (c) => {
  const id = c.req.param('id');
  const updated = await query<{ id: string }>(
    `update timesheets set clock_out = now() where id = :id::uuid and clock_out is null returning id`,
    { id },
  );
  if (updated.length === 0) return c.json({ error: 'Entry not found or already clocked out' }, 404);
  const [row] = await query(`${TIMESHEET_SELECT} where id = :id::uuid`, { id });
  return c.json(row);
});

export default app;
