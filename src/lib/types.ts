// Mirrors db/schema.sql. Money is stored in pence throughout to avoid float
// rounding, same as the schema.

export type ProductCategory = 'tanning_minutes' | 'retail';

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  minutesBalance: number;
  notes?: string;
  termsAccepted: boolean;
}

export interface Bed {
  id: string;
  label: string;
  status: 'available' | 'in_use' | 'maintenance';
  // When the current session is expected to end (ISO). Set when a bed goes
  // in_use for a timed session; the backend auto-reverts the bed to
  // available once this passes. Absent otherwise.
  busyUntil?: string;
}

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  pricePence: number;
  costPricePence?: number; // what we pay for it, for margin; not every product tracks this
  minutes?: number; // set when category = 'tanning_minutes'
  trackStock: boolean;
  active: boolean;
}

export interface StockItem {
  productId: string;
  quantityOnHand: number;
  reorderLevel: number;
  supplier?: string;
}

export type StaffRole = 'owner' | 'manager' | 'staff';

export interface Staff {
  id: string;
  name: string;
  role: StaffRole;
  payRatePence: number; // hourly rate, pence
  active: boolean;
}

export interface Shift {
  id: string;
  staffId: string;
  date: string; // YYYY-MM-DD
  plannedStart: string; // HH:mm
  plannedEnd: string; // HH:mm
}

export interface TimesheetEntry {
  id: string;
  staffId: string;
  shiftId?: string;
  clockIn: string; // ISO
  clockOut?: string; // ISO
}

export interface CartLine {
  product: Product;
  quantity: number;
}

export interface TransactionLine {
  productId?: string; // absent for a costless "used prepaid minutes" line
  productName: string;
  quantity: number;
  unitPricePence: number;
  minutesApplied?: number;
}

export interface Transaction {
  id: string;
  occurredAt: string;
  customerId?: string;
  bedId?: string;
  cashPence: number;
  cardPence: number;
  totalPence: number;
  // Customer's minutes balance immediately after this transaction. Absent
  // when there's no customer on the sale.
  minutesBalanceAfter?: number;
  lines: TransactionLine[];
}

// A day's transactions for the Reports "log" view — every sale and every
// logged (costless) session, newest first.
export interface TransactionLogEntry extends Transaction {
  customerName?: string;
  bedLabel?: string;
}

export const formatPence = (pence: number) =>
  `£${(pence / 100).toFixed(2)}`;
