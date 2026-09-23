import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatPence, type TransactionLogEntry } from '../lib/types';

interface ProductBreakdownRow {
  name: string;
  quantity: number;
  revenuePence: number;
}

interface ReportSummary {
  cashPence: number;
  cardPence: number;
  totalPence: number;
  products: ProductBreakdownRow[];
}

const describeEntry = (entry: TransactionLogEntry) =>
  entry.lines
    .map((l) =>
      l.minutesApplied !== undefined && l.minutesApplied < 0
        ? `Used ${-l.minutesApplied} min`
        : `${l.quantity} × ${l.productName}`,
    )
    .join(', ');

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

const paymentType = (entry: TransactionLogEntry) => {
  if (entry.totalPence === 0) return '—';
  if (entry.cashPence > 0 && entry.cardPence > 0) return 'Split';
  if (entry.cashPence > 0) return 'Cash';
  return 'Card / transfer';
};

const todayStr = () => new Date().toISOString().slice(0, 10);

const formatDateLabel = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

export function ReportsPage() {
  const [date, setDate] = useState(todayStr);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [log, setLog] = useState<TransactionLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logError, setLogError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setLogError(null);
    api
      .get<ReportSummary>(`/reports/summary?date=${date}`)
      .then(setSummary)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load report'));
    api
      .get<TransactionLogEntry[]>(`/reports/log?date=${date}`)
      .then(setLog)
      .catch((e) => setLogError(e instanceof Error ? e.message : 'Failed to load transaction log'));
  }, [date]);

  const isToday = date === todayStr();

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-lg font-semibold">Reports — {formatDateLabel(date)}</h1>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            max={todayStr()}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
          {!isToday && (
            <button
              type="button"
              onClick={() => setDate(todayStr())}
              className="text-xs text-violet-700 underline"
            >
              Today
            </button>
          )}
        </div>
      </div>

      {error && <div className="text-sm text-red-600 mb-4">{error}</div>}

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Total takings</div>
          <div className="text-2xl font-semibold mt-1">{formatPence(summary?.totalPence ?? 0)}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Cash</div>
          <div className="text-2xl font-semibold mt-1">{formatPence(summary?.cashPence ?? 0)}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Card / transfer</div>
          <div className="text-2xl font-semibold mt-1">{formatPence(summary?.cardPence ?? 0)}</div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Product</th>
              <th className="px-4 py-2 font-medium">Qty sold</th>
              <th className="px-4 py-2 font-medium">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {(summary?.products.length ?? 0) === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-slate-400">
                  No sales that day.
                </td>
              </tr>
            )}
            {summary?.products.map((row) => (
              <tr key={row.name} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium text-slate-800">{row.name}</td>
                <td className="px-4 py-2 text-slate-500">{row.quantity}</td>
                <td className="px-4 py-2 text-slate-500">{formatPence(row.revenuePence)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">
        Transaction log
      </h2>
      {logError && <div className="text-sm text-red-600 mb-4">{logError}</div>}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Time</th>
              <th className="px-4 py-2 font-medium">Customer</th>
              <th className="px-4 py-2 font-medium">Bed</th>
              <th className="px-4 py-2 font-medium">Action</th>
              <th className="px-4 py-2 font-medium">Payment</th>
              <th className="px-4 py-2 font-medium">Amount</th>
              <th className="px-4 py-2 font-medium">Remaining</th>
            </tr>
          </thead>
          <tbody>
            {log?.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  No activity that day.
                </td>
              </tr>
            )}
            {log?.map((entry) => (
              <tr key={entry.id} className="border-t border-slate-100">
                <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{formatTime(entry.occurredAt)}</td>
                <td className="px-4 py-2 font-medium text-slate-800">{entry.customerName ?? 'Walk-in'}</td>
                <td className="px-4 py-2 text-slate-500">{entry.bedLabel ?? '—'}</td>
                <td className="px-4 py-2 text-slate-500">{describeEntry(entry)}</td>
                <td className="px-4 py-2 text-slate-500">{paymentType(entry)}</td>
                <td className="px-4 py-2 text-slate-500">{formatPence(entry.totalPence)}</td>
                <td className="px-4 py-2 text-slate-500">
                  {entry.minutesBalanceAfter !== undefined ? `${entry.minutesBalanceAfter} min` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
