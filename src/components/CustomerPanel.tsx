import { useState } from 'react';
import { usePosStore } from '../lib/store';

export function CustomerPanel() {
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const customers = usePosStore((s) => s.customers);
  const selectedCustomerId = usePosStore((s) => s.selectedCustomerId);
  const selectedBedId = usePosStore((s) => s.selectedBedId);
  const selectCustomer = usePosStore((s) => s.selectCustomer);
  const useMinutes = usePosStore((s) => s.useMinutes);

  const selected = customers.find((c) => c.id === selectedCustomerId);
  const filtered = query
    ? customers.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
    : customers;

  const logSession = async (minutes: number) => {
    if (!selected || !selectedBedId) return;
    setError(null);
    try {
      await useMinutes(selected.id, selectedBedId, minutes);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not log session');
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
              onClick={() => selectCustomer(null)}
              className="text-xs text-violet-700 underline"
            >
              Change
            </button>
          </div>
          <div className="mt-2 text-sm">
            Balance: <span className="font-semibold">{selected.minutesBalance} mins</span>
          </div>

          <div className="mt-3 flex gap-2 flex-wrap">
            {[10, 15, 20].map((m) => (
              <button
                key={m}
                type="button"
                disabled={!selectedBedId || selected.minutesBalance < m}
                onClick={() => logSession(m)}
                className="rounded-md bg-white border border-violet-300 px-2 py-1 text-xs font-medium text-violet-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Use {m} min
              </button>
            ))}
          </div>
          {!selectedBedId && (
            <div className="mt-1 text-xs text-slate-500">Select a bed to log a session.</div>
          )}
          {error && <div className="mt-1 text-xs text-red-600">{error}</div>}
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
                onClick={() => selectCustomer(c.id)}
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
    </div>
  );
}
