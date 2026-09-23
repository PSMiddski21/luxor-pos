import { Hono } from 'hono';
import { query } from '../db';

const app = new Hono();

const BED_SELECT = `select id, label, status, busy_until as "busyUntil" from beds`;

// No cron in this stack, so a timed session's expiry is applied lazily: any
// bed still marked in_use whose busy_until has passed is flipped back to
// available right before every read. This makes it correct for whichever
// terminal happens to look next, not just the tab that started the session.
async function releaseExpiredBeds() {
  await query(
    `update beds set status = 'available', busy_until = null
     where status = 'in_use' and busy_until is not null and busy_until <= now()`,
  );
}

app.get('/', async (c) => {
  await releaseExpiredBeds();
  const rows = await query(`${BED_SELECT} order by label`);
  return c.json(rows);
});

interface PatchBody {
  status: 'available' | 'maintenance';
}

// Only toggles between available/maintenance ("is this bed operational?").
// 'in_use' + busy_until are set by the checkout and use-minutes flows, not
// here — a manual toggle always clears any pending expiry.
app.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<PatchBody>();
  if (body.status !== 'available' && body.status !== 'maintenance') {
    return c.json({ error: 'status must be available or maintenance' }, 400);
  }

  await query(`update beds set status = :status, busy_until = null where id = :id`, {
    id,
    status: body.status,
  });

  const [row] = await query(`${BED_SELECT} where id = :id`, { id });
  return c.json(row);
});

export default app;
