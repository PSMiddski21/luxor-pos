import { useState } from 'react';
import { usePosStore } from '../lib/store';
import { formatPence } from '../lib/types';

export function CustomerPanel() {
  const [query, setQuery] = useState('');
  const [minutesInput, setMinutesInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [logging, setLogging] = useState(false);
  const customers = usePosStore((s) => s.customers);
  const products = usePosStore((s) => s.products);
  const selectedCustomerId = usePosStore((s) => s.selectedCustomerId);
  const selectedBedId = usePosStore((s) => s.selectedBedId);
  const selectCustomer = usePosStore((s) => s.selectCustomer);
  const useMinutes = usePosStore((s) => s.useMinutes);
  const addToCart = usePosStore((s) => s.addToCart);

  const selected = customers.find((c) => c.id === selectedCustomerId);
  const filtered = query
    ? customers.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
    : customers;

  const requested = Number(minutesInput) || 0;
  const balance = selected?.minutesBalance ?? 0;
  const shortfall = requested > 0 ? Math.max(0, requested - balance) : 0;
  const canLog = !!selected && !!selectedBedId && requested > 0 && shortfall === 0;
  const tanningProducts = products.filter((p) => p.category === 'tanning_minutes');

  const clearFeedback = () => {
    setError(null);
    setConfirmation(null);
  };

  const logSession = async () => {
    if (!selected || !selectedBedId || !canLog) return;
    setError(null);
    setConfirmation(null);
    setLogging(true);
    try {
      await useMinutes(selected.id, selectedBedId, requested);
      setConfirmation(`Logged ${requested} min for ${selected.name} — committed as a £0.00 sale.`);
      setMinutesInput('');
      // Release the customer straight away, same as pressing Change, so the
      // next session can be logged without an extra manual step.
      selectCustomer(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not log session');
    } finally {
      setLogging(false);
    }
  };

  return (
    <div>
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">Customer</h2>

      {selected ? (
        <div className="rounded-lg border-2 border-violet-500 bg-violet-50 p-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-slate-900">{selected.name}</div>
              <div className="text-sm text-slate-500">{selected.phone}</div>
            </div>
            <button
              type="button"
              onClick={() => {
                selectCustomer(null);
                setMinutesInput('');
                clearFeedback();
              }}
              className="text-xs text-violet-700 underline"
            >
              Change
            </button>
          </div>
          <div className="mt-2 text-sm">
            Balance: <span className="font-semibold">{balance} mins</span>
          </div>

          <div className="mt-3">
            <label className="text-xs text-slate-500" htmlFor="minutes-to-use">
              Minutes to use
            </label>
            <div className="flex gap-2 mt-1">
              <input
                id="minutes-to-use"
                type="number"
                min="1"
                value={minutesInput}
                onChange={(e) => {
                  setMinutesInput(e.target.value);
                  clearFeedback();
                }}
                placeholder="e.g. 15"
                className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
              {[10, 15, 20].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMinutesInput(String(m));
                    clearFeedback();
                  }}
                  className="rounded-md bg-white border border-violet-300 px-2 py-1 text-xs font-medium text-violet-700"
                >
                  {m}
                </button>
              ))}
            </div>

            <button
              type="button"
              disabled={!canLog || logging}
              onClick={logSession}
              className="mt-2 w-full rounded-md bg-violet-600 text-white text-sm font-semibold py-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {logging ? 'Logging…' : 'Log session'}
            </button>

            {!selectedBedId && (
              <div className="mt-1 text-xs text-slate-500">Select a bed to log a session.</div>
            )}

            {shortfall > 0 && (
              <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-2">
                <div className="text-xs text-amber-800 font-medium">
                  {selected.name} is {shortfall} min short ({balance} available) — sell more minutes to cover this
                  session:
                </div>
                <div className="mt-2 flex flex-col gap-1">
                  {tanningProducts.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addToCart(p)}
                      className="flex justify-between items-center rounded-md bg-white border border-amber-200 px-2 py-1 text-xs hover:border-amber-400"
                    >
                      <span>
                        {p.name} ({p.minutes} min)
                      </span>
                      <span className="text-violet-600 font-semibold">{formatPence(p.pricePence)} · Add</span>
                    </button>
                  ))}
                </div>
                <div className="mt-2 text-xs text-amber-700">
                  Take payment in the cart, then log the session again.
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search customer…"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm mb-2"
          />
          <div className="max-h-40 overflow-y-auto flex flex-col gap-1">
            {filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  selectCustomer(c.id);
                  clearFeedback();
                }}
                className="text-left rounded-md border border-slate-200 px-3 py-2 text-sm hover:border-violet-400 flex justify-between"
              >
                <span>{c.name}</span>
                <span className="text-slate-400">{c.minutesBalance} min</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="text-sm text-slate-400 px-1 py-2">No match — treat as walk-in.</div>
            )}
          </div>
        </div>
      )}

      {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
      {confirmation && <div className="mt-2 text-xs text-emerald-600">{confirmation}</div>}
    </div>
  );
}
