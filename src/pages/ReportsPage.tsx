import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatPence } from '../lib/types';

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

export function ReportsPage() {
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<ReportSummary>('/reports/summary')
      .then(setSummary)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load report'));
  }, []);

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-lg font-semibold mb-4">Reports — today</h1>

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

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
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
                  No sales yet today.
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
    </div>
  );
}
