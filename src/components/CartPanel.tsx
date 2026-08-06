import { useMemo, useState } from 'react';
import { usePosStore } from '../lib/store';
import { formatPence, type Transaction } from '../lib/types';

export function CartPanel() {
  const cart = usePosStore((s) => s.cart);
  const removeFromCart = usePosStore((s) => s.removeFromCart);
  const addToCart = usePosStore((s) => s.addToCart);
  const checkout = usePosStore((s) => s.checkout);
  const selectedCustomerId = usePosStore((s) => s.selectedCustomerId);
  const customers = usePosStore((s) => s.customers);

  const [cash, setCash] = useState('');
  const [lastReceipt, setLastReceipt] = useState<Transaction | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalPence = useMemo(
    () => cart.reduce((sum, l) => sum + l.product.pricePence * l.quantity, 0),
    [cart],
  );

  const cashPence = Math.round((parseFloat(cash || '0') || 0) * 100);
  const cardPence = Math.max(totalPence - cashPence, 0);
  const customer = customers.find((c) => c.id === selectedCustomerId);

  const handleCheckout = async () => {
    const effectiveCash = cashPence > totalPence ? totalPence : cashPence;
    const effectiveCard = totalPence - effectiveCash;
    setError(null);
    setSubmitting(true);
    try {
      const receipt = await checkout(effectiveCash, effectiveCard);
      setLastReceipt(receipt);
      setCash('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (lastReceipt) {
    return (
      <div className="flex flex-col h-full">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">Sale complete</h2>
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 flex-1">
          <div className="text-emerald-700 font-semibold text-lg">{formatPence(lastReceipt.totalPence)} taken</div>
          <div className="text-xs text-slate-500 mt-1">
            Cash {formatPence(lastReceipt.cashPence)} · Card {formatPence(lastReceipt.cardPence)}
          </div>
          <ul className="mt-3 text-sm space-y-1">
            {lastReceipt.lines.map((l, i) => (
              <li key={i} className="flex justify-between">
                <span>
                  {l.quantity} × {l.productName}
                </span>
                <span>{formatPence(l.unitPricePence * l.quantity)}</span>
              </li>
            ))}
          </ul>
        </div>
        <button
          type="button"
          onClick={() => setLastReceipt(null)}
          className="mt-4 rounded-lg bg-violet-600 text-white font-semibold py-3 hover:bg-violet-700"
        >
          New sale
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">Cart</h2>

      {customer && (
        <div className="text-xs text-slate-500 mb-2">
          For <span className="font-medium text-slate-700">{customer.name}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto flex flex-col gap-1 min-h-[80px]">
        {cart.length === 0 && <div className="text-sm text-slate-400 py-4">No items yet.</div>}
        {cart.map((line) => (
          <div key={line.product.id} className="flex items-center justify-between text-sm py-1 border-b border-slate-100">
            <div>
              <div className="font-medium text-slate-800">{line.product.name}</div>
              <div className="text-slate-400 text-xs">{formatPence(line.product.pricePence)} each</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => removeFromCart(line.product.id)}
                className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-600"
              >
                −
              </button>
              <span className="w-4 text-center">{line.quantity}</span>
              <button
                type="button"
                onClick={() => addToCart(line.product)}
                className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-600"
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 border-t border-slate-200 pt-3">
        <div className="flex justify-between font-semibold text-lg mb-2">
          <span>Total</span>
          <span>{formatPence(totalPence)}</span>
        </div>

        <label className="text-xs text-slate-500">Cash received (£)</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={cash}
          onChange={(e) => setCash(e.target.value)}
          placeholder="0.00"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm mb-2"
        />
        <div className="text-xs text-slate-500 mb-3">Remaining on card/transfer: {formatPence(cardPence)}</div>

        {error && <div className="text-sm text-red-600 mb-2">{error}</div>}

        <button
          type="button"
          disabled={cart.length === 0 || submitting}
          onClick={handleCheckout}
          className="w-full rounded-lg bg-violet-600 text-white font-semibold py-3 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting ? 'Taking payment…' : 'Take payment'}
        </button>
      </div>
    </div>
  );
}
