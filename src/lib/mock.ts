// Local-preview-only mock backend. Activates automatically when
// public/config.json still holds the placeholder values from
// config.example.json (no real Cognito/API Gateway deployed yet), so real
// deployments are completely unaffected. See RuntimeConfig in ./config.
import type { RuntimeConfig } from './config';
import type {
  Bed,
  Customer,
  Product,
  Shift,
  Staff,
  StockItem,
  TimesheetEntry,
  Transaction,
  TransactionLine,
} from './types';

export function isMockConfig(config: RuntimeConfig): boolean {
  return config.apiUrl.includes('xxxxxxxxxx');
}

let nextId = 1000;
const genId = () => String(nextId++);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const todayIso = () => new Date().toISOString().slice(0, 10);

const beds: Bed[] = [
  { id: 'bed-1', label: 'Bed 1', status: 'available' },
  { id: 'bed-2', label: 'Bed 2', status: 'available' },
  { id: 'bed-3', label: 'Bed 3', status: 'maintenance' },
  { id: 'bed-4', label: 'Bed 4', status: 'available' },
];

const customers: Customer[] = [
  {
    id: 'cust-1',
    name: 'Amy Clarke',
    phone: '07700 900001',
    minutesBalance: 120,
    notes: 'Prefers bed 1',
    termsAccepted: true,
  },
  { id: 'cust-2', name: 'Jordan Lee', phone: '07700 900002', minutesBalance: 30, termsAccepted: true },
  {
    id: 'cust-3',
    name: 'Priya Shah',
    phone: '07700 900003',
    minutesBalance: 0,
    notes: 'New customer',
    termsAccepted: false,
  },
];

const products: Product[] = [
  { id: 'prod-1', name: '6 min tan', category: 'tanning_minutes', pricePence: 600, minutes: 6, trackStock: false, active: true },
  { id: 'prod-2', name: '12 min tan', category: 'tanning_minutes', pricePence: 1100, minutes: 12, trackStock: false, active: true },
  { id: 'prod-3', name: '30 min tan', category: 'tanning_minutes', pricePence: 2200, minutes: 30, trackStock: false, active: true },
  { id: 'prod-4', name: 'Accelerator lotion', category: 'retail', pricePence: 1850, costPricePence: 900, trackStock: true, active: true },
  { id: 'prod-5', name: 'After-sun moisturiser', category: 'retail', pricePence: 1200, costPricePence: 550, trackStock: true, active: true },
  { id: 'prod-6', name: 'Disposable eyewear', category: 'retail', pricePence: 150, costPricePence: 40, trackStock: true, active: true },
];

const stock: StockItem[] = [
  { productId: 'prod-4', quantityOnHand: 14, reorderLevel: 5, supplier: 'Bella Sun' },
  { productId: 'prod-5', quantityOnHand: 3, reorderLevel: 5, supplier: 'Bella Sun' },
  { productId: 'prod-6', quantityOnHand: 40, reorderLevel: 20, supplier: 'Salon Basics' },
];

const staff: Staff[] = [
  { id: 'staff-1', name: 'Paul Middleton', role: 'owner', payRatePence: 0, active: true },
  { id: 'staff-2', name: 'Sam Rivera', role: 'manager', payRatePence: 1350, active: true },
  { id: 'staff-3', name: 'Chloe Bennett', role: 'staff', payRatePence: 1150, active: true },
];

const today = new Date().toISOString().slice(0, 10);
const shifts: Shift[] = [
  { id: 'shift-1', staffId: 'staff-2', date: today, plannedStart: '09:00', plannedEnd: '17:00' },
  { id: 'shift-2', staffId: 'staff-3', date: today, plannedStart: '12:00', plannedEnd: '20:00' },
];

const timesheets: TimesheetEntry[] = [
  {
    id: 'ts-1',
    staffId: 'staff-2',
    shiftId: 'shift-1',
    clockIn: `${today}T09:02:00.000Z`,
  },
];

const transactions: Transaction[] = [];

// No cron here either — mirrors the real backend's lazy expiry (see
// infra/lambda/routes/beds.ts): any bed past its busyUntil is released
// right before it's read.
function releaseExpiredBeds() {
  const now = Date.now();
  for (const bed of beds) {
    if (bed.status === 'in_use' && bed.busyUntil && new Date(bed.busyUntil).getTime() <= now) {
      bed.status = 'available';
      bed.busyUntil = undefined;
    }
  }
}

export async function mockRequest<T>(path: string, init?: RequestInit): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, 150));

  const [basePath, queryString] = path.split('?');
  const query = new URLSearchParams(queryString ?? '');
  const method = init?.method ?? 'GET';
  const body = init?.body ? JSON.parse(init.body as string) : undefined;

  if (method === 'GET' && basePath === '/beds') {
    releaseExpiredBeds();
    return clone(beds) as T;
  }

  const bedMatch = basePath.match(/^\/beds\/(.+)$/);
  if (method === 'PATCH' && bedMatch) {
    const bed = beds.find((b) => b.id === bedMatch[1]);
    if (!bed) throw new Error('Bed not found');
    if (body.status !== 'available' && body.status !== 'maintenance') {
      throw new Error('status must be available or maintenance');
    }
    bed.status = body.status;
    bed.busyUntil = undefined;
    return clone(bed) as T;
  }

  if (method === 'GET' && basePath === '/customers') return clone(customers) as T;

  if (method === 'POST' && basePath === '/customers') {
    const created: Customer = {
      id: genId(),
      name: body.name,
      phone: body.phone || undefined,
      email: body.email || undefined,
      minutesBalance: body.minutesBalance ?? 0,
      notes: body.notes || undefined,
      termsAccepted: body.termsAccepted ?? false,
    };
    customers.push(created);
    return clone(created) as T;
  }

  const customerMatch = basePath.match(/^\/customers\/(.+)$/);
  if (method === 'PATCH' && customerMatch) {
    const cust = customers.find((c) => c.id === customerMatch[1]);
    if (!cust) throw new Error('Customer not found');
    if (typeof body.name === 'string') cust.name = body.name;
    if ('phone' in body) cust.phone = body.phone || undefined;
    if ('email' in body) cust.email = body.email || undefined;
    if (typeof body.minutesBalance === 'number') cust.minutesBalance = body.minutesBalance;
    if ('notes' in body) cust.notes = body.notes || undefined;
    if (typeof body.termsAccepted === 'boolean') cust.termsAccepted = body.termsAccepted;
    return clone(cust) as T;
  }

  if (method === 'POST' && basePath === '/customers/import') {
    const rows: { name: string; phone?: string; email?: string; minutesBalance?: number; notes?: string }[] =
      body.rows ?? [];
    const results: { row: number; name: string; action: 'created' | 'updated' | 'error'; error?: string }[] = [];

    rows.forEach((r, i) => {
      if (!r.name || !r.name.trim()) {
        results.push({ row: i + 1, name: r.name ?? '', action: 'error', error: 'Missing name' });
        return;
      }
      const existing = customers.find((c) => c.name.toLowerCase() === r.name.trim().toLowerCase());
      if (existing) {
        if (r.phone !== undefined) existing.phone = r.phone || undefined;
        if (r.email !== undefined) existing.email = r.email || undefined;
        if (typeof r.minutesBalance === 'number') existing.minutesBalance = r.minutesBalance;
        if (r.notes !== undefined) existing.notes = r.notes || undefined;
        results.push({ row: i + 1, name: existing.name, action: 'updated' });
      } else {
        const created: Customer = {
          id: genId(),
          name: r.name.trim(),
          phone: r.phone || undefined,
          email: r.email || undefined,
          minutesBalance: r.minutesBalance ?? 0,
          notes: r.notes || undefined,
          termsAccepted: false,
        };
        customers.push(created);
        results.push({ row: i + 1, name: created.name, action: 'created' });
      }
    });

    return { customers: clone(customers), results } as T;
  }
  if (method === 'GET' && basePath === '/products') return clone(products.filter((p) => p.active)) as T;

  if (method === 'POST' && basePath === '/products') {
    const name = (body.name ?? '').trim();
    if (!name) throw new Error('Name is required');
    if (typeof body.pricePence !== 'number' || body.pricePence < 0) {
      throw new Error('Price must be a non-negative number');
    }
    if (!Number.isInteger(body.minutes) || body.minutes <= 0) {
      throw new Error('Minutes must be a positive whole number');
    }
    if (products.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      throw new Error(`A product named "${name}" already exists`);
    }
    const created: Product = {
      id: genId(),
      name,
      category: 'tanning_minutes',
      pricePence: body.pricePence,
      minutes: body.minutes,
      trackStock: false,
      active: true,
    };
    products.push(created);
    return clone(created) as T;
  }

  const productMatch = basePath.match(/^\/products\/(.+)$/);
  if (method === 'PATCH' && productMatch) {
    const product = products.find((p) => p.id === productMatch[1]);
    if (!product) throw new Error('Product not found');
    if (typeof body.name === 'string') {
      if (!body.name.trim()) throw new Error('Name is required');
      product.name = body.name.trim();
    }
    if (typeof body.pricePence === 'number') {
      if (body.pricePence < 0) throw new Error('Price must be a non-negative number');
      product.pricePence = body.pricePence;
    }
    if (typeof body.minutes === 'number') {
      if (!Number.isInteger(body.minutes) || body.minutes <= 0) {
        throw new Error('Minutes must be a positive whole number');
      }
      product.minutes = body.minutes;
    }
    if ('costPricePence' in body) {
      if (body.costPricePence !== null && (typeof body.costPricePence !== 'number' || body.costPricePence < 0)) {
        throw new Error('costPricePence must be a non-negative number or null');
      }
      product.costPricePence = body.costPricePence ?? undefined;
    }
    if (typeof body.active === 'boolean') product.active = body.active;
    return clone(product) as T;
  }

  if (method === 'GET' && basePath === '/stock') return clone(stock) as T;

  if (method === 'POST' && basePath === '/stock') {
    const name = (body.name ?? '').trim();
    if (!name) throw new Error('Name is required');
    if (typeof body.pricePence !== 'number' || body.pricePence < 0) {
      throw new Error('Price must be a non-negative number');
    }
    if (products.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      throw new Error(`An item named "${name}" already exists`);
    }

    const product: Product = {
      id: genId(),
      name,
      category: 'retail',
      pricePence: body.pricePence,
      costPricePence: typeof body.costPricePence === 'number' ? body.costPricePence : undefined,
      trackStock: true,
      active: true,
    };
    const stockItem: StockItem = {
      productId: product.id,
      quantityOnHand: body.quantityOnHand ?? 0,
      reorderLevel: body.reorderLevel ?? 0,
      supplier: body.supplier || undefined,
    };
    products.push(product);
    stock.push(stockItem);
    return clone({ product, stockItem }) as T;
  }
  if (method === 'GET' && basePath === '/staff') return clone(staff) as T;

  if (method === 'POST' && basePath === '/staff') {
    const name = (body.name ?? '').trim();
    if (!name) throw new Error('Name is required');
    if (!['owner', 'manager', 'staff'].includes(body.role)) {
      throw new Error('role must be owner, manager, or staff');
    }
    const created: Staff = {
      id: genId(),
      name,
      role: body.role,
      payRatePence: body.payRatePence ?? 0,
      active: true,
    };
    staff.push(created);
    return clone(created) as T;
  }

  const staffMatch = basePath.match(/^\/staff\/(.+)$/);
  if (method === 'PATCH' && staffMatch) {
    const member = staff.find((m) => m.id === staffMatch[1]);
    if (!member) throw new Error('Staff member not found');
    if (typeof body.name === 'string') {
      if (!body.name.trim()) throw new Error('Name is required');
      member.name = body.name.trim();
    }
    if (typeof body.role === 'string') {
      if (!['owner', 'manager', 'staff'].includes(body.role)) {
        throw new Error('role must be owner, manager, or staff');
      }
      member.role = body.role;
    }
    if (typeof body.payRatePence === 'number') member.payRatePence = body.payRatePence;
    if (typeof body.active === 'boolean') member.active = body.active;
    return clone(member) as T;
  }

  if (method === 'GET' && basePath === '/shifts') return clone(shifts) as T;
  if (method === 'GET' && basePath === '/timesheets') return clone(timesheets) as T;

  if (method === 'GET' && basePath === '/reports/summary') {
    const date = query.get('date') ?? todayIso();
    const dayTx = transactions.filter((t) => t.occurredAt.slice(0, 10) === date);
    const cashPence = dayTx.reduce((sum, t) => sum + t.cashPence, 0);
    const cardPence = dayTx.reduce((sum, t) => sum + t.cardPence, 0);
    const byProduct = new Map<string, { name: string; quantity: number; revenuePence: number }>();
    for (const t of dayTx) {
      for (const line of t.lines) {
        if (!line.productId) continue; // costless usage line, not a product sale
        const row = byProduct.get(line.productId) ?? {
          name: line.productName,
          quantity: 0,
          revenuePence: 0,
        };
        row.quantity += line.quantity;
        row.revenuePence += line.unitPricePence * line.quantity;
        byProduct.set(line.productId, row);
      }
    }
    return {
      cashPence,
      cardPence,
      totalPence: cashPence + cardPence,
      products: Array.from(byProduct.values()),
    } as T;
  }

  if (method === 'GET' && basePath === '/reports/log') {
    const date = query.get('date') ?? todayIso();
    const entries = transactions
      .filter((t) => t.occurredAt.slice(0, 10) === date)
      .slice()
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .map((t) => ({
        ...t,
        customerName: t.customerId ? customers.find((c) => c.id === t.customerId)?.name : undefined,
        bedLabel: t.bedId ? beds.find((b) => b.id === t.bedId)?.label : undefined,
      }));
    return clone(entries) as T;
  }

  if (method === 'POST' && basePath === '/transactions') {
    const lines: TransactionLine[] = (body.lines as { productId: string; quantity: number }[]).map((l) => {
      const product = products.find((p) => p.id === l.productId);
      return {
        productId: l.productId,
        productName: product?.name ?? l.productId,
        quantity: l.quantity,
        unitPricePence: product?.pricePence ?? 0,
        minutesApplied: product?.minutes,
      };
    });
    const totalPence = lines.reduce((sum, l) => sum + l.unitPricePence * l.quantity, 0);

    let sessionMinutes = 0;
    for (const line of lines) {
      const product = products.find((p) => p.id === line.productId);
      if (product?.trackStock) {
        const item = stock.find((s) => s.productId === line.productId);
        if (item) item.quantityOnHand = Math.max(0, item.quantityOnHand - line.quantity);
      }
      if (product?.category === 'tanning_minutes' && product.minutes) {
        sessionMinutes += product.minutes * line.quantity;
        if (body.customerId) {
          const cust = customers.find((c) => c.id === body.customerId);
          if (cust) cust.minutesBalance += product.minutes * line.quantity;
        }
      }
    }
    // A tanning-minutes purchase with a bed attached means the customer is
    // starting that session now — occupy the bed for its length. Released
    // by releaseExpiredBeds() once busyUntil passes, no cron needed.
    if (body.bedId && sessionMinutes > 0) {
      const bed = beds.find((b) => b.id === body.bedId);
      if (bed) {
        bed.status = 'in_use';
        bed.busyUntil = new Date(Date.now() + sessionMinutes * 60_000).toISOString();
      }
    }

    const tx: Transaction = {
      id: genId(),
      occurredAt: new Date().toISOString(),
      customerId: body.customerId,
      bedId: body.bedId,
      cashPence: body.cashPence,
      cardPence: body.cardPence,
      totalPence,
      minutesBalanceAfter: body.customerId
        ? customers.find((c) => c.id === body.customerId)?.minutesBalance
        : undefined,
      lines,
    };
    transactions.push(tx);
    return clone(tx) as T;
  }

  if (method === 'POST' && basePath === '/transactions/use-minutes') {
    const cust = customers.find((c) => c.id === body.customerId);
    if (!cust || cust.minutesBalance < body.minutes) {
      throw new Error(`Customer does not have ${body.minutes} minutes available`);
    }
    cust.minutesBalance -= body.minutes;
    const bed = beds.find((b) => b.id === body.bedId);
    if (bed) {
      bed.status = 'in_use';
      bed.busyUntil = new Date(Date.now() + body.minutes * 60_000).toISOString();
    }

    // Committed as a real, zero-value transaction so usage is still
    // auditable alongside paid sales — see infra/lambda/routes/transactions.ts.
    const tx: Transaction = {
      id: genId(),
      occurredAt: new Date().toISOString(),
      customerId: body.customerId,
      bedId: body.bedId,
      cashPence: 0,
      cardPence: 0,
      totalPence: 0,
      minutesBalanceAfter: cust.minutesBalance,
      lines: [
        {
          productName: 'Used minutes',
          quantity: 1,
          unitPricePence: 0,
          minutesApplied: -body.minutes,
        },
      ],
    };
    transactions.push(tx);
    return clone(tx) as T;
  }

  const stockMatch = basePath.match(/^\/stock\/(.+)$/);
  if (method === 'PATCH' && stockMatch) {
    const item = stock.find((s) => s.productId === stockMatch[1]);
    if (item) {
      if (typeof body.delta === 'number') item.quantityOnHand = Math.max(0, item.quantityOnHand + body.delta);
      if (typeof body.quantityOnHand === 'number') item.quantityOnHand = body.quantityOnHand;
      if (typeof body.reorderLevel === 'number') item.reorderLevel = body.reorderLevel;
    }
    return clone(item) as T;
  }

  if (method === 'POST' && basePath === '/shifts') {
    const created: Shift = { id: genId(), staffId: body.staffId, date: body.date, plannedStart: body.plannedStart, plannedEnd: body.plannedEnd };
    shifts.push(created);
    return clone(created) as T;
  }

  const shiftMatch = basePath.match(/^\/shifts\/(.+)$/);
  if (method === 'DELETE' && shiftMatch) {
    const idx = shifts.findIndex((s) => s.id === shiftMatch[1]);
    if (idx !== -1) shifts.splice(idx, 1);
    return undefined as T;
  }

  if (method === 'POST' && basePath === '/timesheets/clock-in') {
    const entry: TimesheetEntry = {
      id: genId(),
      staffId: body.staffId,
      shiftId: body.shiftId,
      clockIn: new Date().toISOString(),
    };
    timesheets.unshift(entry);
    return clone(entry) as T;
  }

  const clockOutMatch = basePath.match(/^\/timesheets\/(.+)\/clock-out$/);
  if (method === 'POST' && clockOutMatch) {
    const entry = timesheets.find((t) => t.id === clockOutMatch[1]);
    if (entry) entry.clockOut = new Date().toISOString();
    return clone(entry) as T;
  }

  throw new Error(`Mock API: unhandled ${method} ${path}`);
}
