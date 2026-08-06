// Mirrors db/schema.sql. Money is stored in pence throughout to avoid float
// rounding, same as the schema.

export type ProductCategory = 'tanning_minutes' | 'retail';

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  minutesBalance: number;
  notes?: string;
}

export interface Bed {
  id: string;
  label: string;
  status: 'available' | 'in_use' | 'maintenance';
}

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  pricePence: number;
  minutes?: number; // set when category = 'tanning_minutes'
  trackStock: boolean;
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
  productId: string;
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
  lines: TransactionLine[];
}

export const formatPence = (pence: number) =>
  `£${(pence / 100).toFixed(2)}`;
