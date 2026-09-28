import { Hono } from 'hono';
import { query } from '../db';

const app = new Hono();

const SHIFT_SELECT = `
  select id, staff_id as "staffId",
         to_char(shift_date, 'YYYY-MM-DD') as "date",
         to_char(planned_start, 'HH24:MI') as "plannedStart",
         to_char(planned_end, 'HH24:MI') as "plannedEnd"
  from shifts
`;

app.get('/', async (c) => {
  const rows = await query(`${SHIFT_SELECT} order by shift_date, planned_start`);
  return c.json(rows);
});

interface CreateShiftBody extends Record<string, string> {
  staffId: string;
  date: string;
  plannedStart: string;
  plannedEnd: string;
}

app.post('/', async (c) => {
  const body = await c.req.json<CreateShiftBody>();
  // Two statements, not a data-modifying CTE followed by a SELECT off it —
  // RDS Data API silently returns zero records for that shape even though
  // the insert itself commits fine.
  const [inserted] = await query<{ id: string }>(
    `insert into shifts (staff_id, shift_date, planned_start, planned_end)
     values (:staffId::uuid, :date, :plannedStart, :plannedEnd)
     returning id`,
    body,
  );
  const [row] = await query(`${SHIFT_SELECT} where id = :id::uuid`, { id: inserted.id });
  return c.json(row, 201);
});

app.delete('/:id', async (c) => {
  const id = c.req.param('id');
  await query(`delete from shifts where id = :id::uuid`, { id });
  return c.body(null, 204);
});

export default app;
