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

  selectBed: (bedId: string | null) => void;
  selectCustomer: (customerId: string | null) => void;
  addToCart: (product: Product) => void;
  removeFromCart: (productId: string) => void;
  clearSale: () => void;

  checkout: (cashPence: number, cardPence: number) => Promise<Transaction>;
  useMinutes: (customerId: string, bedId: string, minutes: number) => Promise<void>;

  adjustStock: (productId: string, delta: number) => Promise<void>;
  setStockCount: (productId: string, quantity: number) => Promise<void>;
  setReorderLevel: (productId: string, level: number) => Promise<void>;

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

  selectBed: (bedId) => set({ selectedBedId: bedId }),
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

    // Re-fetch the two slices checkout can change rather than trying to
    // reconcile balance/stock deltas on the client.
    const [customers, stock] = await Promise.all([
      api.get<Customer[]>('/customers'),
      api.get<StockItem[]>('/stock'),
    ]);

    set({ customers, stock, cart: [], selectedBedId: null, selectedCustomerId: null });
    return transaction;
  },

  useMinutes: async (customerId, bedId, minutes) => {
    await api.post('/transactions/use-minutes', { customerId, bedId, minutes });
    const customers = await api.get<Customer[]>('/customers');
    set({ customers, selectedBedId: bedId });
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
