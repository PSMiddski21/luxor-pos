import { create } from 'zustand';
import { api } from './api';
import type {
  Bed,
  CartLine,
  Customer,
  Product,
  Shift,
  Staff,
  StockItem,
  TimesheetEntry,
  Transaction,
} from './types';

export interface NewCustomer {
  name: string;
  phone?: string;
  email?: string;
  minutesBalance?: number;
  notes?: string;
  termsAccepted?: boolean;
}

export interface CustomerImportRowResult {
  row: number;
  name: string;
  action: 'created' | 'updated' | 'error';
  error?: string;
}

export interface CustomerImportResult {
  customers: Customer[];
  results: CustomerImportRowResult[];
}

export interface NewStockItem {
  name: string;
  pricePence: number;
  costPricePence?: number;
  quantityOnHand?: number;
  reorderLevel?: number;
  supplier?: string;
}

export interface NewStaff {
  name: string;
  role: Staff['role'];
  payRatePence?: number;
  active?: boolean;
}

export interface NewTanningProduct {
  name: string;
  pricePence: number;
  minutes: number;
}

export interface ProductUpdate {
  name?: string;
  pricePence?: number;
  minutes?: number;
  costPricePence?: number | null;
  active?: boolean;
}

interface PosState {
  // Server-backed data, loaded via init()
  beds: Bed[];
  customers: Customer[];
  products: Product[];
  stock: StockItem[];
  staff: Staff[];
  shifts: Shift[];
  timesheets: TimesheetEntry[];

  dataStatus: 'idle' | 'loading' | 'ready' | 'error';
  dataError?: string;

  // Local-only till state — the cart isn't persisted until checkout
  selectedBedId: string | null;
  selectedCustomerId: string | null;
  cart: CartLine[];

  init: () => Promise<void>;

  createCustomer: (data: NewCustomer) => Promise<Customer>;
  updateCustomer: (customerId: string, data: NewCustomer) => Promise<Customer>;
  importCustomers: (rows: NewCustomer[]) => Promise<CustomerImportResult>;

  selectBed: (bedId: string | null) => void;
  setBedStatus: (bedId: string, status: 'available' | 'maintenance') => Promise<void>;
  refreshBeds: () => Promise<void>;
  selectCustomer: (customerId: string | null) => void;
  addToCart: (product: Product) => void;
  removeFromCart: (productId: string) => void;
  clearSale: () => void;

  checkout: (cashPence: number, cardPence: number) => Promise<Transaction>;
  useMinutes: (customerId: string, bedId: string, minutes: number) => Promise<Transaction>;

  addStockItem: (data: NewStockItem) => Promise<void>;
  adjustStock: (productId: string, delta: number) => Promise<void>;
  setStockCount: (productId: string, quantity: number) => Promise<void>;
  setReorderLevel: (productId: string, level: number) => Promise<void>;
  setCostPrice: (productId: string, costPricePence: number | null) => Promise<void>;

  createTanningProduct: (data: NewTanningProduct) => Promise<Product>;
  updateProduct: (productId: string, data: ProductUpdate) => Promise<Product>;

  createStaff: (data: NewStaff) => Promise<Staff>;
  updateStaff: (staffId: string, data: NewStaff) => Promise<Staff>;

  addShift: (shift: Omit<Shift, 'id'>) => Promise<void>;
  removeShift: (shiftId: string) => Promise<void>;

  clockIn: (staffId: string, shiftId?: string) => Promise<void>;
  clockOut: (entryId: string) => Promise<void>;
}

export const usePosStore = create<PosState>((set, get) => ({
  beds: [],
  customers: [],
  products: [],
  stock: [],
  staff: [],
  shifts: [],
  timesheets: [],
  dataStatus: 'idle',

  selectedBedId: null,
  selectedCustomerId: null,
  cart: [],

  init: async () => {
    if (get().dataStatus === 'loading') return;
    set({ dataStatus: 'loading', dataError: undefined });
    try {
      const [beds, customers, products, stock, staff, shifts, timesheets] = await Promise.all([
        api.get<Bed[]>('/beds'),
        api.get<Customer[]>('/customers'),
        api.get<Product[]>('/products'),
        api.get<StockItem[]>('/stock'),
        api.get<Staff[]>('/staff'),
        api.get<Shift[]>('/shifts'),
        api.get<TimesheetEntry[]>('/timesheets'),
      ]);
      set({ beds, customers, products, stock, staff, shifts, timesheets, dataStatus: 'ready' });
    } catch (err) {
      set({ dataStatus: 'error', dataError: err instanceof Error ? err.message : 'Failed to load data' });
    }
  },

  createCustomer: async (data) => {
    const created = await api.post<Customer>('/customers', data);
    set((s) => ({ customers: [...s.customers, created].sort((a, b) => a.name.localeCompare(b.name)) }));
    return created;
  },

  updateCustomer: async (customerId, data) => {
    const updated = await api.patch<Customer>(`/customers/${customerId}`, data);
    set((s) => ({
      customers: s.customers
        .map((c) => (c.id === customerId ? updated : c))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }));
    return updated;
  },

  importCustomers: async (rows) => {
    const result = await api.post<CustomerImportResult>('/customers/import', { rows });
    set({ customers: result.customers.slice().sort((a, b) => a.name.localeCompare(b.name)) });
    return result;
  },

  selectBed: (bedId) => set({ selectedBedId: bedId }),

  setBedStatus: async (bedId, status) => {
    const updated = await api.patch<Bed>(`/beds/${bedId}`, { status });
    set((s) => ({
      beds: s.beds.map((b) => (b.id === bedId ? updated : b)),
      selectedBedId: s.selectedBedId === bedId && status === 'maintenance' ? null : s.selectedBedId,
    }));
  },

  // Polled from the POS screen so a bed whose timed session has ended shows
  // as available again without a manual reload — see beds' lazy expiry in
  // infra/lambda/routes/beds.ts (no cron in this stack).
  refreshBeds: async () => {
    const beds = await api.get<Bed[]>('/beds');
    set({ beds });
  },

  selectCustomer: (customerId) => set({ selectedCustomerId: customerId }),

  addToCart: (product) =>
    set((state) => {
      const existing = state.cart.find((l) => l.product.id === product.id);
      if (existing) {
        return {
          cart: state.cart.map((l) =>
            l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l,
          ),
        };
      }
      return { cart: [...state.cart, { product, quantity: 1 }] };
    }),

  removeFromCart: (productId) =>
    set((state) => ({
      cart: state.cart
        .map((l) => (l.product.id === productId ? { ...l, quantity: l.quantity - 1 } : l))
        .filter((l) => l.quantity > 0),
    })),

  clearSale: () => set({ cart: [], selectedBedId: null, selectedCustomerId: null }),

  checkout: async (cashPence, cardPence) => {
    const state = get();
    const transaction = await api.post<Transaction>('/transactions', {
      customerId: state.selectedCustomerId ?? undefined,
      bedId: state.selectedBedId ?? undefined,
      cashPence,
      cardPence,
      lines: state.cart.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
    });

    // Re-fetch the slices checkout can change rather than trying to
    // reconcile balance/stock/bed-status deltas on the client.
    const [customers, stock, beds] = await Promise.all([
      api.get<Customer[]>('/customers'),
      api.get<StockItem[]>('/stock'),
      api.get<Bed[]>('/beds'),
    ]);

    set({ customers, stock, beds, cart: [], selectedBedId: null, selectedCustomerId: null });
    return transaction;
  },

  useMinutes: async (customerId, bedId, minutes) => {
    const transaction = await api.post<Transaction>('/transactions/use-minutes', {
      customerId,
      bedId,
      minutes,
    });
    const [customers, beds] = await Promise.all([
      api.get<Customer[]>('/customers'),
      api.get<Bed[]>('/beds'),
    ]);
    set({ customers, beds, selectedBedId: bedId });
    return transaction;
  },

  addStockItem: async (data) => {
    const { product, stockItem } = await api.post<{ product: Product; stockItem: StockItem }>('/stock', data);
    set((s) => ({
      products: [...s.products, product].sort((a, b) => a.name.localeCompare(b.name)),
      stock: [...s.stock, stockItem],
    }));
  },

  adjustStock: async (productId, delta) => {
    const updated = await api.patch<StockItem>(`/stock/${productId}`, { delta });
    set((s) => ({ stock: s.stock.map((i) => (i.productId === productId ? updated : i)) }));
  },

  setStockCount: async (productId, quantity) => {
    const updated = await api.patch<StockItem>(`/stock/${productId}`, { quantityOnHand: quantity });
    set((s) => ({ stock: s.stock.map((i) => (i.productId === productId ? updated : i)) }));
  },

  setReorderLevel: async (productId, level) => {
    const updated = await api.patch<StockItem>(`/stock/${productId}`, { reorderLevel: level });
    set((s) => ({ stock: s.stock.map((i) => (i.productId === productId ? updated : i)) }));
  },

  setCostPrice: async (productId, costPricePence) => {
    const updated = await api.patch<Product>(`/products/${productId}`, { costPricePence });
    set((s) => ({ products: s.products.map((p) => (p.id === productId ? updated : p)) }));
  },

  createTanningProduct: async (data) => {
    const created = await api.post<Product>('/products', data);
    set((s) => ({ products: [...s.products, created].sort((a, b) => a.name.localeCompare(b.name)) }));
    return created;
  },

  updateProduct: async (productId, data) => {
    const updated = await api.patch<Product>(`/products/${productId}`, data);
    set((s) => ({
      // Deactivating drops it from the list, matching what a fresh GET
      // /products (active-only) would return.
      products: updated.active
        ? s.products.map((p) => (p.id === productId ? updated : p)).sort((a, b) => a.name.localeCompare(b.name))
        : s.products.filter((p) => p.id !== productId),
    }));
    return updated;
  },

  createStaff: async (data) => {
    const created = await api.post<Staff>('/staff', data);
    set((s) => ({ staff: [...s.staff, created].sort((a, b) => a.name.localeCompare(b.name)) }));
    return created;
  },

  updateStaff: async (staffId, data) => {
    const updated = await api.patch<Staff>(`/staff/${staffId}`, data);
    set((s) => ({
      // Deactivating drops them from the list, matching what a fresh GET
      // /staff (active-only) would return.
      staff: updated.active
        ? s.staff.map((m) => (m.id === staffId ? updated : m)).sort((a, b) => a.name.localeCompare(b.name))
        : s.staff.filter((m) => m.id !== staffId),
    }));
    return updated;
  },

  addShift: async (shift) => {
    const created = await api.post<Shift>('/shifts', shift);
    set((s) => ({ shifts: [...s.shifts, created] }));
  },

  removeShift: async (shiftId) => {
    await api.delete(`/shifts/${shiftId}`);
    set((s) => ({ shifts: s.shifts.filter((sh) => sh.id !== shiftId) }));
  },

  clockIn: async (staffId, shiftId) => {
    const entry = await api.post<TimesheetEntry>('/timesheets/clock-in', { staffId, shiftId });
    set((s) => ({ timesheets: [entry, ...s.timesheets] }));
  },

  clockOut: async (entryId) => {
    const entry = await api.post<TimesheetEntry>(`/timesheets/${entryId}/clock-out`);
    set((s) => ({ timesheets: s.timesheets.map((t) => (t.id === entryId ? entry : t)) }));
  },
}));
